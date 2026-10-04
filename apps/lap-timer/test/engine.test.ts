import { describe, expect, test } from 'bun:test';
import { decodeReference, encodeReference } from '../src/shared/codec.ts';
import { BINS, LapEngine, type Reference } from '../src/shared/engine.ts';
import type { Sample } from '../src/shared/protocol.ts';
import { Simulator } from '../src/shared/simulator.ts';

const DT = 1 / 60;

function rig() {
  const saved = new Map<string, Reference | null>();
  let changes = 0;
  const engine = new LapEngine({
    loadBest: key => saved.get(key) ?? null,
    saveBest: (key, best) => void saved.set(key, best),
    changed: () => void changes++,
  });
  return { engine, saved, changes: () => changes };
}

/** steady laps at a fixed speed, so every number can be worked out by hand */
function steady(speed: number, length = 3000) {
  let time = 0;
  let dist = 0.95;
  let lapStart = 0;
  let last = -1;
  return (dt: number, over: Partial<Sample> = {}): Sample => {
    time += dt;
    dist += (speed * dt) / length;
    if (dist >= 1) {
      dist -= 1;
      const crossAt = time - (dist * length) / speed;
      last = crossAt - lapStart;
      lapStart = crossAt;
    }
    return {
      sim: 'Test',
      track: 'Test',
      trackId: 'test',
      car: 'Car',
      carId: 'car',
      trackLength: length,
      sessionTime: time,
      live: true,
      inPit: false,
      lapDist: dist,
      lapTime: time - lapStart,
      lastLapTime: last,
      speed,
      lapValid: true,
      ...over,
    };
  };
}

describe('lap timing', () => {
  test('times a lap from line to line', () => {
    const { engine } = rig();
    const next = steady(50);
    for (let i = 0; i < 60 * 130; i++) engine.update(next(DT));
    const { laps, sessionBest } = engine.session();
    expect(laps.length).toBe(2);
    for (const lap of laps) {
      expect(lap.time).toBeCloseTo(60, 2);
      expect(lap.valid).toBe(true);
    }
    expect(sessionBest).toBeCloseTo(60, 2);
  });

  test('does not time the lap it joined part way through', () => {
    const { engine } = rig();
    const next = steady(50);
    for (let i = 0; i < 60 * 2; i++) engine.update(next(DT));
    expect(engine.session().laps.length).toBe(0);
    expect(engine.frame().delta).toBeNull();
  });

  test('matches the sim on every lap of a varied run', () => {
    const { engine } = rig();
    const sim = new Simulator(7);
    const official: number[] = [];
    let last = -1;
    for (let i = 0; i < 60 * 60 * 12; i++) {
      const s = sim.step(DT);
      if (s.lastLapTime !== last) {
        official.push(s.lastLapTime);
        last = s.lastLapTime;
      }
      engine.update(s);
    }
    // the first crossing ends the lap the engine joined, which it does not count
    const timed = official.slice(1);
    const laps = engine.session().laps;
    expect(laps.length).toBe(timed.length);
    expect(laps.length).toBeGreaterThan(4);
    laps.forEach((lap, i) => expect(lap.time).toBeCloseTo(timed[i]!, 3));
  });
});

describe('predictive delta', () => {
  test('reads zero against an identical lap and tracks a slower one', () => {
    const { engine } = rig();
    const next = steady(50);
    for (let i = 0; i < 60 * 70; i++) engine.update(next(DT));
    expect(engine.session().laps.length).toBe(1);
    for (let i = 0; i < 60 * 30; i++) engine.update(next(DT));
    const level = engine.frame();
    expect(level.delta).toBeCloseTo(0, 2);
    expect(level.deltaV).toBeCloseTo(0, 2);
    expect(level.pred).toBeCloseTo(60, 2);

    const slow = steady(40);
    const fresh = rig().engine;
    const fast = steady(50);
    for (let i = 0; i < 60 * 70; i++) fresh.update(fast(DT));
    // carry on from the same place at four fifths of the speed
    let s = fast(DT);
    const base = s.sessionTime;
    let dist = s.lapDist;
    for (let i = 1; i <= 60 * 30; i++) {
      dist += (40 * DT) / 3000;
      s = { ...slow(DT), sessionTime: base + i * DT, lapDist: dist, lapTime: s.lapTime + DT, speed: 40 };
      fresh.update(s);
    }
    const frame = fresh.frame();
    expect(frame.deltaV).toBeCloseTo(-10, 1);
    expect(frame.delta!).toBeGreaterThan(5);
    expect(frame.pred!).toBeCloseTo(60 + frame.delta!, 3);
  });

  test('a faster lap becomes the reference and is saved', () => {
    const { engine, saved } = rig();
    const sim = new Simulator(3);
    for (let i = 0; i < 60 * 60 * 10; i++) engine.update(sim.step(DT));
    const { laps, sessionBest, allTimeBest } = engine.session();
    const quickest = Math.min(...laps.map(lap => lap.time));
    expect(sessionBest).toBeCloseTo(quickest, 3);
    expect(allTimeBest).toBeCloseTo(quickest, 3);
    expect(saved.get('Demo|demo|demo')!.lapTime).toBeCloseTo(quickest, 3);
  });

  test('picks the reference the mode asks for', () => {
    const { engine } = rig();
    const sim = new Simulator(11);
    for (let i = 0; i < 60 * 60 * 8; i++) engine.update(sim.step(DT));
    const { laps, sessionBest } = engine.session();
    expect(engine.frame().ref).toBeCloseTo(sessionBest!, 3);
    engine.setRefMode('last');
    expect(engine.frame().ref).toBeCloseTo(laps.at(-1)!.time, 3);
  });
});

describe('laps that should not count', () => {
  test('a lap through the pits is recorded but never the reference', () => {
    const { engine } = rig();
    const next = steady(50);
    for (let i = 0; i < 60 * 70; i++) engine.update(next(DT, { inPit: i > 60 * 20 && i < 60 * 25 }));
    const { laps, sessionBest } = engine.session();
    expect(laps.length).toBe(1);
    expect(laps[0]!.valid).toBe(false);
    expect(sessionBest).toBeNull();
  });

  test('a lap the sim invalidates is not the reference', () => {
    const { engine } = rig();
    const next = steady(50);
    for (let i = 0; i < 60 * 70; i++) engine.update(next(DT, { lapValid: i < 60 * 30 || i > 60 * 31 }));
    expect(engine.session().laps[0]!.valid).toBe(false);
    expect(engine.session().sessionBest).toBeNull();
  });

  test('a jump across the track abandons the lap', () => {
    const { engine } = rig();
    const next = steady(50);
    for (let i = 0; i < 60 * 20; i++) engine.update(next(DT));
    const s = next(DT);
    engine.update({ ...s, lapDist: (s.lapDist + 0.4) % 1 });
    expect(engine.frame().delta).toBeNull();
    for (let i = 0; i < 60 * 45; i++) engine.update(next(DT));
    expect(engine.session().laps.length).toBe(0);
  });

  test('distance flapping over the line counts one crossing', () => {
    const { engine } = rig();
    const next = steady(50);
    let flapped = false;
    for (let i = 0; i < 60 * 70; i++) {
      const s = next(DT);
      engine.update(s);
      if (!flapped && s.lapDist < 0.01 && i > 60) {
        engine.update({ ...s, sessionTime: s.sessionTime + 0.001, lapDist: 0.9999 });
        engine.update({ ...s, sessionTime: s.sessionTime + 0.002, lapDist: 0.0002 });
        flapped = true;
      }
    }
    const laps = engine.session().laps;
    expect(laps.length).toBe(1);
    expect(laps[0]!.time).toBeCloseTo(60, 2);
  });

  test('a pause carries the lap on, a restart does not', () => {
    const { engine } = rig();
    const next = steady(50);
    let s = next(DT);
    for (let i = 0; i < 60 * 30; i++) engine.update((s = next(DT)));
    for (let i = 0; i < 100; i++) engine.update({ ...s, live: false });
    for (let i = 0; i < 60 * 40; i++) engine.update(next(DT));
    expect(engine.session().laps.length).toBe(1);

    const restarted = rig().engine;
    const again = steady(50);
    for (let i = 0; i < 60 * 30; i++) restarted.update((s = again(DT)));
    restarted.update({ ...s, live: false });
    for (let i = 0; i < 60 * 45; i++) restarted.update({ ...again(DT), sessionTime: i * DT });
    expect(restarted.session().laps.length).toBe(0);
  });
});

describe('the sim has the last word on a lap time', () => {
  test('takes the official time when it lands just after the line', () => {
    const { engine, saved } = rig();
    const next = steady(50);
    let official = -1;
    let finishedAt = -1;
    for (let i = 0; i < 60 * 75; i++) {
      const s = next(DT);
      if (s.lastLapTime > 30 && finishedAt < 0) finishedAt = i;
      if (finishedAt >= 0 && i > finishedAt + 30) official = 60.004;
      engine.update({ ...s, lastLapTime: official });
    }
    expect(engine.session().laps[0]!.time).toBeCloseTo(60.004, 3);
    expect(saved.get('Test|test|car')!.lapTime).toBeCloseTo(60.004, 3);
  });
});

describe('stored references', () => {
  test('survive a round trip', () => {
    const times = new Float32Array(BINS + 1).map((_, i) => i * 0.06);
    const speeds = new Float32Array(BINS + 1).fill(50);
    const back = decodeReference(JSON.parse(JSON.stringify(encodeReference({ lapTime: 60, times, speeds, date: 5 }))));
    expect(back!.lapTime).toBe(60);
    expect(back!.date).toBe(5);
    expect(Array.from(back!.times)).toEqual(Array.from(times));
    expect(Array.from(back!.speeds)).toEqual(Array.from(speeds));
  });

  test('reject anything malformed', () => {
    expect(decodeReference(null)).toBeNull();
    expect(decodeReference({ lapTime: 60, times: 'AAAA', speeds: 'AAAA' })).toBeNull();
    expect(decodeReference({ lapTime: -1, times: '', speeds: '' })).toBeNull();
  });
});

describe('a sim that works out its own delta', () => {
  const sim = (delta: number | null, rate = 0) => ({
    simDelta: {
      best: { delta, rate, refTime: null },
      session: { delta, rate, refTime: 58.5 },
      last: { delta: null, rate: 0, refTime: null },
    },
  });

  test('is shown as it stands, with the prediction built on its reference', () => {
    const { engine } = rig();
    engine.setRefMode('session');
    const next = steady(50);
    for (let i = 0; i < 60 * 2; i++) engine.update(next(DT, sim(-0.4, -0.1)));
    const frame = engine.frame();
    // no lap has been recorded here, so every number below can only have come from the sim
    expect(engine.session().laps.length).toBe(0);
    expect(frame.delta).toBe(-0.4);
    expect(frame.ref).toBe(58.5);
    expect(frame.pred).toBeCloseTo(58.1, 6);
    // gaining a tenth every second at 50 m/s means the reference was doing 50 / 1.1 here
    expect(frame.deltaV).toBeCloseTo(50 - 50 / 1.1, 2);
    expect(engine.session().sessionBest).toBe(58.5);
  });

  test('shows nothing while the sim has no delta to give', () => {
    const { engine } = rig();
    engine.setRefMode('session');
    const next = steady(50);
    for (let i = 0; i < 60 * 70; i++) engine.update(next(DT, sim(null)));
    const frame = engine.frame();
    expect(frame.delta).toBeNull();
    expect(frame.pred).toBeNull();
    expect(frame.ref).toBe(58.5);
  });

  test('learns a reference time the sim does not publish from the delta at the line', () => {
    const { engine } = rig();
    const next = steady(50);
    for (let i = 0; i < 60 * 70; i++) engine.update(next(DT, sim(1.5)));
    // a 60 second lap that finished 1.5 down means the reference was a 58.5
    expect(engine.frame().ref).toBeCloseTo(58.5, 2);
    expect(engine.session().lastDelta).toBe(1.5);
  });

  test('other sims still get the delta worked out here', () => {
    const { engine } = rig();
    const next = steady(50);
    for (let i = 0; i < 60 * 100; i++) engine.update(next(DT));
    expect(engine.frame().delta).toBeCloseTo(0, 2);
  });
});
