import type { Sample } from '../../src/shared/protocol.ts';
import { openMapping } from '../win32.ts';
import { AMS2_MAPPING, Ams2Reader } from './ams2.ts';
import { IRACING_MAPPING, IRacingReader } from './iracing.ts';
import { LMU_MAPPING, LmuReader } from './lmu.ts';
import { R3E_MAPPING, R3eReader } from './r3e.ts';
import type { Log, Reader, SourceFactory, TelemetrySource } from './types.ts';

function mapped(name: string, mapping: string, make: (view: DataView, log: Log) => Reader | null): SourceFactory {
  return {
    name,
    open(log) {
      const memory = openMapping(mapping);
      if (!memory) return null;
      const reader = make(memory.view, log);
      if (!reader) {
        memory.close();
        return null;
      }
      return { poll: () => reader.poll(), pulse: () => reader.pulse(), close: () => memory.close() };
    },
  };
}

export const SOURCES: readonly SourceFactory[] = [
  mapped('iRacing', IRACING_MAPPING, view => new IRacingReader(view)),
  mapped('Le Mans Ultimate', LMU_MAPPING, LmuReader.create),
  mapped('Automobilista 2', AMS2_MAPPING, Ams2Reader.create),
  mapped('RaceRoom', R3E_MAPPING, R3eReader.create),
];

const SCAN_INTERVAL_MS = 1000;
const QUIET_LIMIT_MS = 3000;
const STALE_LIMIT_MS = 5000;

/** Finds whichever sim is running a session and keeps reading it until it stops. */
export class SourceManager {
  private active: { factory: SourceFactory; source: TelemetrySource } | null = null;
  private lastScanAt = -Infinity;
  private lastSampleAt = 0;
  private lastPulse = NaN;
  private lastPulseAt = 0;
  private warned = new Set<string>();

  constructor(
    private readonly factories: readonly SourceFactory[],
    private readonly log: Log,
  ) {}

  get activeName(): string | null {
    return this.active?.factory.name ?? null;
  }

  poll(now: number): Sample | null {
    if (!this.active) {
      if (now - this.lastScanAt < SCAN_INTERVAL_MS) return null;
      this.lastScanAt = now;
      return this.scan(now);
    }

    const { source } = this.active;
    let sample: Sample | null;
    let pulse: number;
    try {
      sample = source.poll();
      pulse = source.pulse();
    } catch (error) {
      this.log(`${this.active.factory.name} reader failed: ${error}`);
      this.drop();
      return null;
    }

    if (pulse !== this.lastPulse) {
      this.lastPulse = pulse;
      this.lastPulseAt = now;
    } else if (now - this.lastPulseAt > STALE_LIMIT_MS) {
      // a sim that has exited leaves its memory behind for as long as it stays mapped here, and
      // looks the same as one that is paused. letting go and opening it again tells them apart.
      this.lastPulseAt = now;
      if (!this.reopen()) return null;
    }

    if (sample) this.lastSampleAt = now;
    else if (now - this.lastSampleAt > QUIET_LIMIT_MS) this.drop();
    return sample;
  }

  close(): void {
    this.drop();
  }

  private scan(now: number): Sample | null {
    for (const factory of this.factories) {
      let source: TelemetrySource | null = null;
      try {
        source = factory.open(message => this.warnOnce(message));
        const sample = source?.poll() ?? null;
        if (source && sample) {
          this.active = { factory, source };
          this.lastSampleAt = now;
          this.lastPulse = source.pulse();
          this.lastPulseAt = now;
          this.log(`reading ${factory.name}`);
          return sample;
        }
      } catch (error) {
        this.warnOnce(`${factory.name} reader failed: ${error}`);
      }
      source?.close();
    }
    return null;
  }

  private reopen(): boolean {
    const { factory, source } = this.active!;
    source.close();
    let fresh: TelemetrySource | null = null;
    try {
      fresh = factory.open(message => this.warnOnce(message));
    } catch (error) {
      this.warnOnce(`${factory.name} reader failed: ${error}`);
    }
    if (fresh) {
      this.active = { factory, source: fresh };
      return true;
    }
    this.active = null;
    this.log(`lost ${factory.name}`);
    return false;
  }

  private drop(): void {
    if (!this.active) return;
    this.log(`lost ${this.active.factory.name}`);
    this.active.source.close();
    this.active = null;
  }

  private warnOnce(message: string): void {
    if (this.warned.has(message)) return;
    this.warned.add(message);
    this.log(message);
  }
}
