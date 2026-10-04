import { LapEngine, type Reference } from '../src/shared/engine.ts';
import type { Command, Outbound, RefMode } from '../src/shared/protocol.ts';
import { SourceManager } from './sources/index.ts';
import type { Log, SourceFactory } from './sources/types.ts';

const POLL_MS = 16;
const LIVE_FRAME_MS = 33;
const IDLE_FRAME_MS = 1000;
const GONE_AFTER_MS = 3000;

export interface RuntimeHost {
  log: Log;
  /** send to every screen showing the app */
  emit(message: Outbound): void;
  /** whether any screen is showing the app, so frames are worth building */
  watched(): boolean;
  loadBest(key: string): Reference | null;
  saveBest(key: string, best: Reference | null): void;
  saveRefMode(mode: RefMode): void;
}

/** Reads whichever sim is running, times its laps, and feeds the screens. */
export class Runtime {
  private readonly engine: LapEngine;
  private readonly sources: SourceManager;
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastSampleAt = -Infinity;
  private lastFrameAt = -Infinity;
  private sessionDirty = false;

  constructor(
    private readonly host: RuntimeHost,
    factories: readonly SourceFactory[],
    refMode: RefMode = 'best',
  ) {
    this.engine = new LapEngine({
      loadBest: key => host.loadBest(key),
      saveBest: (key, best) => host.saveBest(key, best),
      changed: () => {
        this.sessionDirty = true;
      },
    });
    this.engine.refMode = refMode;
    this.sources = new SourceManager(factories, host.log);
  }

  start(): void {
    this.timer ??= setInterval(() => this.tick(performance.now()), POLL_MS);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.sources.close();
  }

  /** `reply` reaches only the screen that asked */
  command(command: Command, reply: (message: Outbound) => void): void {
    switch (command.t) {
      case 'hello':
        reply(this.engine.session());
        reply(this.engine.frame());
        return;
      case 'ref':
        this.engine.setRefMode(command.mode);
        this.host.saveRefMode(command.mode);
        return;
      case 'clearBest':
        this.engine.clearBest();
        return;
      case 'resetSession':
        this.engine.resetSession();
        return;
    }
  }

  private tick(now: number): void {
    const sample = this.sources.poll(now);
    if (sample) {
      this.lastSampleAt = now;
      this.engine.update(sample);
    } else if (now - this.lastSampleAt > GONE_AFTER_MS) {
      this.engine.idle();
    }

    if (!this.host.watched()) return;
    if (this.sessionDirty) {
      this.sessionDirty = false;
      this.host.emit(this.engine.session());
    }
    const frame = this.engine.frame();
    if (now - this.lastFrameAt >= (frame.live ? LIVE_FRAME_MS : IDLE_FRAME_MS)) {
      this.lastFrameAt = now;
      this.host.emit(frame);
    }
  }
}
