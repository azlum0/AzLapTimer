import type { BridgethingClient, BrightnessMode } from '@bridgething/client';
import { useCallback, useEffect, useRef, useState } from 'react';

const SLEEP_AFTER_SECONDS = 180;
/** the backlight while asleep, 0 to 1: low enough to lose the glow, not so low the screen is lost with it */
const SLEEP_BACKLIGHT = 0.02;
const SAVED_KEY = 'sleep.backlight';

/** `?sleep=5` shortens the wait, for trying the sleep screen without sitting through three minutes */
function sleepAfterMs(): number {
  const override = Number(new URLSearchParams(window.location.search).get('sleep'));
  return (override > 0 ? override : SLEEP_AFTER_SECONDS) * 1000;
}

interface Backlight {
  mode: BrightnessMode;
  level: number;
}

/**
 * Turns the backlight down for sleep and puts it back afterwards.
 *
 * The device keeps its brightness setting through a restart, so what to go back to is written to
 * the device's store before anything is turned down. If the power goes while the screen is
 * asleep, the next start finds that note and undoes the dimming.
 */
class SleepBacklight {
  private saved: Backlight | null = null;
  /** one change at a time, in the order they were asked for */
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly client: BridgethingClient) {}

  dim(): void {
    this.run(async () => {
      if (this.saved) return;
      const state = await this.client.hardware.stateGet();
      if (!state.ok) return;
      const { mode, level } = state.response.state.brightness;
      this.saved = { mode, level };
      await this.client.store.put({ key: SAVED_KEY, value: JSON.stringify(this.saved) });
      // the level first: in automatic mode it is only noted, so the screen never flashes on the way down
      await this.client.hardware.displaySetLevel({ level: SLEEP_BACKLIGHT });
      await this.client.hardware.displaySetMode({ mode: 'manual' });
    });
  }

  restore(): void {
    this.run(async () => {
      const saved = this.saved ?? (await this.left());
      if (!saved) return;
      this.send(saved);
      this.saved = null;
      await this.client.store.delete({ key: SAVED_KEY });
    });
  }

  /** for the moment the page is going away: no waiting, just get the messages out */
  restoreNow(): void {
    if (this.saved) this.send(this.saved);
  }

  private send(saved: Backlight): void {
    if (saved.mode === 'auto') {
      void this.client.hardware.displaySetMode({ mode: 'auto' });
      void this.client.hardware.displaySetLevel({ level: saved.level });
    } else {
      void this.client.hardware.displaySetLevel({ level: saved.level });
    }
  }

  /** what an earlier run of the app left noted in the store, if it never got to undo its dimming */
  private async left(): Promise<Backlight | null> {
    const note = await this.client.store.get({ key: SAVED_KEY });
    if (!note.ok || !note.response.value) return null;
    try {
      const { mode, level } = JSON.parse(note.response.value) as Partial<Backlight>;
      return (mode === 'auto' || mode === 'manual') && typeof level === 'number' ? { mode, level } : null;
    } catch {
      return null;
    }
  }

  private run(step: () => Promise<void>): void {
    this.queue = this.queue.then(step).catch(() => {});
  }
}

export interface Sleep {
  asleep: boolean;
  /** for any touch, button, or turn of the dial: wakes the screen and starts the wait again */
  wake(): void;
  /** go to sleep now instead of waiting */
  sleepNow(): void;
  /** whether sleeping also turns the backlight down, which only a real Car Thing can do */
  dims: boolean;
}

/**
 * Goes to sleep once `idle` has held for the whole wait with nobody touching the device, or at
 * once when asked. Sleep ends on a touch, and whenever `idle` stops being true.
 */
export function useSleep(idle: boolean, client: BridgethingClient | null): Sleep {
  const [asleep, setAsleep] = useState(false);
  const [touched, setTouched] = useState(0);
  const backlight = useRef<SleepBacklight | null>(null);
  if (client && !backlight.current) backlight.current = new SleepBacklight(client);

  useEffect(() => {
    setAsleep(false);
    if (!idle) return;
    const timer = setTimeout(() => setAsleep(true), sleepAfterMs());
    return () => clearTimeout(timer);
  }, [idle, touched]);

  useEffect(() => {
    if (!client) return;
    const light = backlight.current!;
    // every time the device link comes up while awake, undo any dimming an earlier run left behind
    const settle = () => (asleep ? light.dim() : light.restore());
    if (client.connectionState === 'open') settle();
    const off = client.on(event => {
      if (event.type === 'open') settle();
    });
    return off;
  }, [client, asleep]);

  useEffect(() => {
    const leaving = () => backlight.current?.restoreNow();
    window.addEventListener('pagehide', leaving);
    return () => window.removeEventListener('pagehide', leaving);
  }, []);

  const wake = useCallback(() => setTouched(count => count + 1), []);
  const sleepNow = useCallback(() => setAsleep(true), []);
  return { asleep, wake, sleepNow, dims: client !== null };
}

/** the AzDashboard mark, taken from its app icon without the tile behind it */
function AzMark({ width }: { width: number }) {
  return (
    <svg width={width} viewBox="4 10 200 93" role="img" aria-label="Az">
      <path fill="#F2F6FA" d="M8 90 76 14h22l25 31-20 22-20-25-44 48Z" />
      <path fill="#16D5E5" d="M111 14h89l-19 22h-51Zm49 31h28l-40 45h-29ZM71 65h35L88 85H53Z" />
      <path fill="#F2F6FA" d="M139 99h58l-18-20h-22Z" />
    </svg>
  );
}

/** a black screen with the mark in the corner, so the display is not lit up while nobody is driving */
export function SleepScreen({ onWake, dimmed }: { onWake(): void; dimmed: boolean }) {
  return (
    <div
      className="absolute inset-0 z-10 bg-black"
      // the tap that wakes the screen should not also turn to the next one, so the whole tap stays
      // here: waking on the press would take this away before the click lands
      onPointerDown={event => event.stopPropagation()}
      onClick={event => {
        event.stopPropagation();
        onWake();
      }}>
      {/* with the backlight turned right down the mark needs all the brightness it can get */}
      <div className="absolute right-5 bottom-4" style={{ opacity: dimmed ? 1 : 0.45 }}>
        <AzMark width={34} />
      </div>
    </div>
  );
}
