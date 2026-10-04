import type { Sample } from './protocol.ts';

const TRACK_LENGTH = 4200;

/** speed in metres per second at a point on a made-up circuit: straights with a few corners cut into them */
function idealSpeed(lapDist: number): number {
  const corners: [at: number, width: number, depth: number][] = [
    [0.08, 0.03, 42],
    [0.22, 0.05, 30],
    [0.36, 0.025, 50],
    [0.52, 0.06, 26],
    [0.68, 0.03, 38],
    [0.81, 0.04, 46],
    [0.94, 0.025, 34],
  ];
  let speed = 78;
  for (const [at, width, depth] of corners) {
    const x = (lapDist - at) / width;
    speed -= depth * Math.exp(-x * x);
  }
  return Math.max(speed, 16);
}

/** deterministic noise so two runs of a test match */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Drives laps of a made-up circuit, each one a little faster or slower in places than the last. */
export class Simulator {
  private readonly random: () => number;
  private time = 0;
  private dist = 0.97;
  private lapStart = 0;
  private lastLapTime = -1;
  private pace = 1;
  private sectors: number[] = [];

  constructor(seed = 1) {
    this.random = mulberry32(seed);
    this.rollPace();
  }

  step(dt: number): Sample {
    const sector = this.sectors[Math.min(Math.floor(this.dist * this.sectors.length), this.sectors.length - 1)]!;
    const speed = idealSpeed(this.dist) * this.pace * sector;
    this.time += dt;
    this.dist += (speed * dt) / TRACK_LENGTH;
    if (this.dist >= 1) {
      this.dist -= 1;
      const over = (this.dist * TRACK_LENGTH) / speed;
      const crossAt = this.time - over;
      this.lastLapTime = crossAt - this.lapStart;
      this.lapStart = crossAt;
      this.rollPace();
    }
    return {
      sim: 'Demo',
      track: 'Demo Circuit',
      trackId: 'demo',
      car: 'Demo Car',
      carId: 'demo',
      trackLength: TRACK_LENGTH,
      sessionTime: this.time,
      live: true,
      inPit: false,
      lapDist: this.dist,
      lapTime: this.time - this.lapStart,
      lastLapTime: this.lastLapTime,
      speed,
      lapValid: true,
    };
  }

  private rollPace(): void {
    this.pace = 0.97 + this.random() * 0.04;
    this.sectors = Array.from({ length: 6 }, () => 0.975 + this.random() * 0.05);
  }
}
