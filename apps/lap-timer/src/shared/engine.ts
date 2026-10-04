import { REF_MODES, type Frame, type LapRecord, type RefMode, type Sample, type Session } from './protocol.ts';

/** a lap is stored as elapsed time and speed at BINS + 1 evenly spaced points around the track */
export const BINS = 1000;

const MIN_LAP_SECONDS = 5;
const CROSSING_JITTER_SECONDS = 2;
const MAX_GAP_SECONDS = 2;
const OFFICIAL_WINDOW_SECONDS = 5;
const OFFICIAL_TOLERANCE_SECONDS = 0.5;
const MAX_LAPS_KEPT = 200;

export interface Reference {
  lapTime: number;
  times: Float32Array;
  speeds: Float32Array;
  /** ms since the epoch */
  date: number;
}

export interface EngineHost {
  loadBest(key: string): Reference | null;
  saveBest(key: string, best: Reference | null): void;
  /** the session state changed and screens should be told */
  changed?(): void;
}

interface Trace {
  times: Float32Array;
  speeds: Float32Array;
  /** began at the start line, so it can become a reference */
  started: boolean;
  clean: boolean;
  /** highest bin written */
  maxBin: number;
  vmax: number;
}

interface Pending {
  record: LapRecord;
  reference: Reference | null;
  /** the lap's delta was measured against our own reference, so it moves with the lap time */
  ownDelta: boolean;
  /** what the sim called the last lap before this one finished */
  simLastBefore: number;
  deadline: number;
}

function newTrace(started: boolean): Trace {
  return {
    times: new Float32Array(BINS + 1).fill(NaN),
    speeds: new Float32Array(BINS + 1).fill(NaN),
    started,
    clean: started,
    maxBin: -1,
    vmax: 0,
  };
}

function at(values: Float32Array, lapDist: number): number {
  const x = Math.min(Math.max(lapDist, 0), 1) * BINS;
  const i = Math.floor(x);
  if (i >= BINS) return values[BINS]!;
  return values[i]! + (x - i) * (values[i + 1]! - values[i]!);
}

/** a missed bin takes the straight line between its neighbours */
function patch(values: Float32Array): void {
  let last = -1;
  for (let i = 0; i <= BINS; i++) {
    if (Number.isNaN(values[i]!)) continue;
    if (last >= 0 && i - last > 1) {
      for (let j = last + 1; j < i; j++) {
        values[j] = values[last]! + ((j - last) / (i - last)) * (values[i]! - values[last]!);
      }
    }
    last = i;
  }
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;
const round3OrNull = (value: number | null): number | null => (value === null ? null : round3(value));

/**
 * Turns a stream of samples into lap times and a live delta against a reference lap.
 *
 * The delta compares time into the lap now with the reference's time at the same point on
 * track, which is how a predictive lap timer works.
 */
export class LapEngine {
  refMode: RefMode = 'best';

  private key = '';
  private connected = false;
  private sim = '';
  private track = '';
  private car = '';
  private laps: LapRecord[] = [];
  private lapCount = 0;
  private sessionBest: Reference | null = null;
  private allTimeBest: Reference | null = null;
  private lastReference: Reference | null = null;
  private lastDelta: number | null = null;
  private cur: Trace | null = null;
  private lapStart = 0;
  private lastCrossAt = -Infinity;
  private prev: Sample | null = null;
  private latest: Sample | null = null;
  /** where the car was when it last stopped being live */
  private parked: Sample | null = null;
  private pending: Pending | null = null;
  /** lap times of the sim's own references, worked out at the line for those it does not publish */
  private learned: Partial<Record<RefMode, number>> = {};
  private simSessionBest: number | null = null;

  constructor(private readonly host: EngineHost) {}

  update(s: Sample): void {
    const key = `${s.sim}|${s.trackId}|${s.carId}`;
    if (key !== this.key) this.switchCombo(key, s);
    if (!this.connected) {
      this.connected = true;
      this.host.changed?.();
    }
    this.latest = s;

    const simSessionBest = s.simDelta?.session?.refTime ?? null;
    if (simSessionBest !== this.simSessionBest) {
      this.simSessionBest = simSessionBest;
      this.host.changed?.();
    }

    if (!s.live) {
      if (this.prev) this.parked = this.prev;
      this.prev = null;
      return;
    }

    const p = this.prev ?? this.resume(s);
    if (!p || !this.cur) {
      this.beginPartial(s);
      return;
    }

    const dt = s.sessionTime - p.sessionTime;
    if (dt < 0 || dt > MAX_GAP_SECONDS) {
      this.beginPartial(s);
      return;
    }
    if (dt === 0) return;

    const moved = s.lapDist - p.lapDist;
    if (moved < -0.5) {
      // the scored distance can flap either side of the line for a tick or two
      if (s.sessionTime - this.lastCrossAt < MIN_LAP_SECONDS) return;
      this.cross(p, s, dt);
    } else if (moved > 0.5) {
      if (s.sessionTime - this.lastCrossAt < CROSSING_JITTER_SECONDS) return;
      this.beginPartial(s);
      return;
    } else if (moved > 0) {
      const length = s.trackLength > 0 ? s.trackLength : 3000;
      const reach = Math.max(0.02, (3 * Math.max(s.speed, p.speed) * dt) / length);
      if (moved > reach) {
        this.beginPartial(s);
        return;
      }
      this.fill(p.lapDist, p.sessionTime - this.lapStart, p.speed, s.lapDist, s.sessionTime - this.lapStart, s.speed);
    }

    const cur = this.cur;
    if (s.inPit || !s.lapValid) cur.clean = false;
    if (s.speed > cur.vmax) cur.vmax = s.speed;
    this.prev = s;
    this.reconcile(s);
  }

  /** the sim went away. the laps stay, in case it is the same session coming back. */
  idle(): void {
    if (!this.connected) return;
    this.connected = false;
    this.latest = null;
    this.prev = null;
    this.parked = null;
    this.cur = null;
    this.pending = null;
    this.host.changed?.();
  }

  setRefMode(mode: RefMode): void {
    if (mode === this.refMode) return;
    this.refMode = mode;
    this.host.changed?.();
  }

  clearBest(): void {
    this.allTimeBest = null;
    this.sessionBest = null;
    this.lastReference = null;
    if (this.key) this.host.saveBest(this.key, null);
    this.host.changed?.();
  }

  resetSession(): void {
    this.laps = [];
    this.lapCount = 0;
    this.sessionBest = null;
    this.lastReference = null;
    this.lastDelta = null;
    this.pending = null;
    this.host.changed?.();
  }

  frame(): Frame {
    const s = this.latest;
    const cur = this.cur;
    const reference = this.reference();
    const frame: Frame = {
      t: 'f',
      sim: this.connected ? this.sim : null,
      live: false,
      pit: false,
      lap: this.lapCount + 1,
      time: null,
      delta: null,
      deltaV: null,
      pred: null,
      speed: 0,
      vmax: 0,
      valid: true,
      ref: reference ? round3(reference.lapTime) : null,
    };
    if (!s) return frame;

    const sim = s.simDelta?.[this.refMode];
    const simRef = sim ? this.simRefTime(s) : null;
    if (sim) frame.ref = simRef === null ? null : round3(simRef);

    frame.live = s.live;
    frame.pit = s.inPit;
    frame.speed = round3(s.speed);
    if (!s.live || !cur) return frame;

    const time = s.sessionTime - this.lapStart;
    frame.vmax = round3(cur.vmax);
    frame.valid = cur.clean || !cur.started;
    if (cur.started || s.lapTime >= 0) frame.time = round3(time);
    if (sim) {
      if (sim.delta !== null) {
        frame.delta = round3(sim.delta);
        // losing a second every second means standing still, so the speed gap follows from the rate
        frame.deltaV = sim.rate < 0.9 ? round3((-s.speed * sim.rate) / (1 - sim.rate)) : null;
        frame.pred = simRef === null ? null : round3(simRef + sim.delta);
      }
    } else if (cur.started && reference) {
      const delta = time - at(reference.times, s.lapDist);
      frame.delta = round3(delta);
      frame.deltaV = round3(s.speed - at(reference.speeds, s.lapDist));
      frame.pred = round3(reference.lapTime + delta);
    }
    return frame;
  }

  session(): Session {
    return {
      t: 's',
      sim: this.connected ? this.sim : null,
      track: this.track,
      car: this.car,
      refMode: this.refMode,
      laps: this.laps.slice(-50).map(lap => ({ ...lap, time: round3(lap.time), vmax: round3(lap.vmax) })),
      sessionBest: round3OrNull(this.simSessionBest ?? this.sessionBest?.lapTime ?? null),
      allTimeBest: this.allTimeBest ? round3(this.allTimeBest.lapTime) : null,
      lastDelta: this.lastDelta === null ? null : round3(this.lastDelta),
    };
  }

  /** lap time of the reference the sim is measuring against in the current mode */
  private simRefTime(s: Sample): number | null {
    return s.simDelta?.[this.refMode]?.refTime ?? this.learned[this.refMode] ?? this.reference()?.lapTime ?? null;
  }

  private reference(): Reference | null {
    if (this.refMode === 'last') return this.lastReference;
    if (this.refMode === 'session') return this.sessionBest;
    return this.allTimeBest ?? this.sessionBest;
  }

  private switchCombo(key: string, s: Sample): void {
    this.key = key;
    this.sim = s.sim;
    this.track = s.track;
    this.car = s.car;
    this.laps = [];
    this.lapCount = 0;
    this.sessionBest = null;
    this.lastReference = null;
    this.lastDelta = null;
    this.cur = null;
    this.prev = null;
    this.parked = null;
    this.pending = null;
    this.learned = {};
    this.lastCrossAt = -Infinity;
    this.allTimeBest = this.host.loadBest(key);
    this.host.changed?.();
  }

  /** a pause leaves the car where it was, so the lap carries on; anything else starts over */
  private resume(s: Sample): Sample | null {
    const parked = this.parked;
    this.parked = null;
    if (!parked || !this.cur) return null;
    const gap = s.sessionTime - parked.sessionTime;
    if (gap < 0 || gap > MAX_GAP_SECONDS) return null;
    return Math.abs(s.lapDist - parked.lapDist) < 0.01 ? parked : null;
  }

  /** joined mid-lap, so this lap can show a time but never set one */
  private beginPartial(s: Sample): void {
    this.cur = newTrace(false);
    this.cur.maxBin = Math.floor(s.lapDist * BINS);
    this.cur.vmax = s.speed;
    this.lapStart = s.sessionTime - Math.max(s.lapTime, 0);
    this.prev = s;
  }

  private fill(d0: number, t0: number, v0: number, d1: number, t1: number, v1: number): void {
    const cur = this.cur!;
    const b0 = d0 * BINS;
    const b1 = d1 * BINS;
    if (b1 <= b0) return;
    const first = Math.max(Math.ceil(b0), cur.maxBin + 1);
    const last = Math.min(Math.floor(b1), BINS);
    for (let b = first; b <= last; b++) {
      const f = (b - b0) / (b1 - b0);
      cur.times[b] = t0 + f * (t1 - t0);
      cur.speeds[b] = v0 + f * (v1 - v0);
    }
    if (last > cur.maxBin) cur.maxBin = last;
  }

  private cross(p: Sample, s: Sample, dt: number): void {
    const before = 1 - p.lapDist;
    const span = before + s.lapDist;
    const f = span > 0 ? before / span : 0;
    const crossAt = p.sessionTime + f * dt;
    const crossSpeed = p.speed + f * (s.speed - p.speed);

    const done = this.cur!;
    if (done.started) {
      this.fill(p.lapDist, p.sessionTime - this.lapStart, p.speed, 1, crossAt - this.lapStart, crossSpeed);
      this.complete(done, crossAt - this.lapStart, p, crossAt);
    }

    this.lapStart = crossAt;
    this.lastCrossAt = crossAt;
    this.cur = newTrace(true);
    this.cur.times[0] = 0;
    this.cur.speeds[0] = crossSpeed;
    this.cur.maxBin = 0;
    this.cur.vmax = Math.max(crossSpeed, s.speed);
    this.fill(0, 0, crossSpeed, s.lapDist, s.sessionTime - crossAt, s.speed);
  }

  private complete(done: Trace, time: number, before: Sample, crossAt: number): void {
    const valid = done.clean && time >= MIN_LAP_SECONDS;
    const record: LapRecord = { n: ++this.lapCount, time, valid, vmax: done.vmax };
    this.laps.push(record);
    if (this.laps.length > MAX_LAPS_KEPT) this.laps.shift();

    // the sim's delta on the last reading before the line is its verdict on the whole lap
    const sim = before.simDelta?.[this.refMode];
    const against = this.reference();
    this.lastDelta = sim ? sim.delta : against ? time - against.lapTime : null;
    for (const mode of REF_MODES) {
      const own = before.simDelta?.[mode];
      if (!own || own.refTime !== null || own.delta === null) continue;
      this.learned[mode] = valid && own.delta < 0 ? time : time - own.delta;
    }

    let reference: Reference | null = null;
    if (valid) {
      patch(done.times);
      patch(done.speeds);
      reference = { lapTime: time, times: done.times, speeds: done.speeds, date: Date.now() };
      this.lastReference = reference;
      if (!this.sessionBest || time < this.sessionBest.lapTime) this.sessionBest = reference;
      if (!this.allTimeBest || time < this.allTimeBest.lapTime) {
        this.allTimeBest = reference;
        this.host.saveBest(this.key, reference);
      }
    }

    this.pending = {
      record,
      reference,
      ownDelta: !sim,
      simLastBefore: before.lastLapTime,
      deadline: crossAt + OFFICIAL_WINDOW_SECONDS,
    };
    this.host.changed?.();
  }

  /** the sim's own time for the lap arrives a moment after the line and replaces ours */
  private reconcile(s: Sample): void {
    const pending = this.pending;
    if (!pending) return;
    if (s.sessionTime > pending.deadline) {
      this.pending = null;
      return;
    }
    const official = s.lastLapTime;
    if (official <= 0 || Math.abs(official - pending.simLastBefore) < 1e-4) return;
    this.pending = null;
    if (Math.abs(official - pending.record.time) > OFFICIAL_TOLERANCE_SECONDS) return;

    if (pending.ownDelta && this.lastDelta !== null) this.lastDelta += official - pending.record.time;
    pending.record.time = official;
    const reference = pending.reference;
    if (reference) {
      reference.lapTime = official;
      reference.times[BINS] = official;
      if (reference === this.allTimeBest) this.host.saveBest(this.key, reference);
    }
    this.host.changed?.();
  }
}
