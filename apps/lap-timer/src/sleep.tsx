import { useCallback, useEffect, useState } from 'react';

const SLEEP_AFTER_SECONDS = 180;

/** `?sleep=5` shortens the wait, for trying the sleep screen without sitting through three minutes */
function sleepAfterMs(): number {
  const override = Number(new URLSearchParams(window.location.search).get('sleep'));
  return (override > 0 ? override : SLEEP_AFTER_SECONDS) * 1000;
}

/**
 * Goes to sleep once `idle` has held for the whole wait with nobody touching the device. `wake`
 * is for any touch, button, or turn of the dial: it wakes the screen and starts the wait again.
 */
export function useSleep(idle: boolean): [asleep: boolean, wake: () => void] {
  const [asleep, setAsleep] = useState(false);
  const [touched, setTouched] = useState(0);

  useEffect(() => {
    setAsleep(false);
    if (!idle) return;
    const timer = setTimeout(() => setAsleep(true), sleepAfterMs());
    return () => clearTimeout(timer);
  }, [idle, touched]);

  const wake = useCallback(() => setTouched(count => count + 1), []);
  return [asleep, wake];
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
export function SleepScreen({ onWake }: { onWake(): void }) {
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
      <div className="absolute right-5 bottom-4 opacity-45">
        <AzMark width={34} />
      </div>
    </div>
  );
}
