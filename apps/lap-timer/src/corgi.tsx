import { useRef } from 'react';
import type { Frame } from './shared/protocol';

// the drawings in the repo's Assets/corgi folder, which sort by name into order of pace
const files = import.meta.glob<string>('../../../Assets/corgi/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});
const DRAWINGS = Object.keys(files)
  .sort()
  .map(path => files[path]!);

const ASLEEP = 0;
const READY = 1;
const SLOWEST = 2;
const CRUISE = 4;
const LEVEL = 6;
const FASTEST = 11;
/** seconds of delta from one drawing to the next, which puts the last one half a second up, where the gradient is full */
const STEP_SECONDS = 0.1;
/** how far past the point half way between two drawings the delta has to go, in steps, before the drawing changes */
const HOLD = 0.25;
/** metres per second under which the car counts as standing still */
const STOPPED = 1;

/**
 * Which drawing to show: asleep when not driving, waiting when stopped, and otherwise quicker
 * the further ahead of the reference lap. `was` is the one showing now, which stays up until the
 * delta is clearly into the next, so a delta sitting on a boundary does not flick between two.
 */
export function corgiState(frame: Frame, delta: number | null, was: number): number {
  if (!frame.live) return ASLEEP;
  if (frame.speed < STOPPED) return READY;
  if (delta === null) return CRUISE;
  const exact = LEVEL - delta / STEP_SECONDS;
  if (was >= SLOWEST && Math.abs(exact - was) < 0.5 + HOLD) return was;
  return Math.min(Math.max(Math.round(exact), SLOWEST), FASTEST);
}

/** the corgi in its car, across the lower part of the screen */
export function Corgi({ frame, delta }: { frame: Frame; delta: number | null }) {
  const was = useRef(ASLEEP);
  const state = corgiState(frame, delta, was.current);
  was.current = state;
  // all of them stay in the page so a change is a fade between two that are already loaded. the new one
  // fades in over the old, which goes once it is covered: two half faded cars would show the screen through both
  return DRAWINGS.map((url, i) => (
    <img
      key={url}
      src={url}
      alt=""
      draggable={false}
      className={`absolute top-[72px] left-10 h-[480px] w-[720px] max-w-none transition-opacity ${
        i === state ? 'z-[1] opacity-100 duration-150' : 'opacity-0 delay-150 duration-0'
      }`}
    />
  ));
}
