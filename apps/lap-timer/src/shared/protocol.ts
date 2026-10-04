export type RefMode = 'best' | 'session' | 'last';

export const REF_MODES: readonly RefMode[] = ['best', 'session', 'last'];

/** A delta the sim works out itself, against a reference lap that it keeps. */
export interface SimDelta {
  /** seconds, negative is faster; null while the sim has nothing to compare against */
  delta: number | null;
  /** seconds of delta gained per second of driving */
  rate: number;
  /** lap time of the sim's reference, null when the sim does not say */
  refTime: number | null;
}

/** One normalized telemetry reading. Every sim reader produces these. */
export interface Sample {
  sim: string;
  track: string;
  trackId: string;
  car: string;
  carId: string;
  /** metres, 0 when the sim does not say */
  trackLength: number;
  /** seconds on the sim's own clock, monotonic while driving */
  sessionTime: number;
  /** the player is in the car and the physics are running */
  live: boolean;
  inPit: boolean;
  /** 0..1 around the lap */
  lapDist: number;
  /** seconds into the current lap as the sim reports it, negative when unknown */
  lapTime: number;
  /** seconds, zero or negative when the sim has none */
  lastLapTime: number;
  /** metres per second */
  speed: number;
  /** false once the sim has invalidated the current lap */
  lapValid: boolean;
  /**
   * The sim's own deltas, for the references it tracks. When one is here it is shown in place of
   * the one worked out from recorded laps, so the screen agrees with the sim's own dash.
   */
  simDelta?: Partial<Record<RefMode, SimDelta>>;
}

export interface LapRecord {
  n: number;
  time: number;
  valid: boolean;
  /** top speed on the lap, metres per second */
  vmax: number;
}

/** What the screen draws, sent many times a second while driving. */
export interface Frame {
  t: 'f';
  /** name of the sim feeding data, null when none is running */
  sim: string | null;
  live: boolean;
  pit: boolean;
  /** the lap being driven, counting from 1 */
  lap: number;
  /** seconds into the current lap */
  time: number | null;
  /** seconds against the reference at this point on track, negative is faster */
  delta: number | null;
  /** metres per second against the reference at this point on track */
  deltaV: number | null;
  /** predicted time for this lap */
  pred: number | null;
  speed: number;
  /** top speed so far this lap */
  vmax: number;
  valid: boolean;
  /** lap time of the reference in use */
  ref: number | null;
}

/** Slow-changing state, sent when it changes and when a screen asks for it. */
export interface Session {
  t: 's';
  sim: string | null;
  track: string;
  car: string;
  refMode: RefMode;
  laps: LapRecord[];
  sessionBest: number | null;
  allTimeBest: number | null;
  /** delta of the last completed lap against the reference it was driven against */
  lastDelta: number | null;
}

export type Outbound = Frame | Session;

export type Command = { t: 'hello' } | { t: 'ref'; mode: RefMode } | { t: 'clearBest' } | { t: 'resetSession' };

export function isCommand(value: unknown): value is Command {
  if (typeof value !== 'object' || value === null) return false;
  const t = (value as { t?: unknown }).t;
  if (t === 'hello' || t === 'clearBest' || t === 'resetSession') return true;
  return t === 'ref' && REF_MODES.includes((value as { mode?: RefMode }).mode as RefMode);
}

export function isOutbound(value: unknown): value is Outbound {
  if (typeof value !== 'object' || value === null) return false;
  const t = (value as { t?: unknown }).t;
  return t === 'f' || t === 's';
}
