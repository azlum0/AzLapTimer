// Aurora: curtains of thin vertical rays hanging from a wavy lower edge, brightest along that edge
// and fading upward from green into violet, folding and shimmering as they drift across a few stars.

export interface AnimationData {
  time: number; // seconds since the animation started
  dt: number; // seconds since the previous frame
  width: number; // 800
  height: number; // 480
  live: boolean; // true while the car is being driven
  speed: number; // km/h, 0 when not driving
  delta: number | null; // seconds vs reference lap, negative = ahead, null = nothing to compare
  colours: { background: string; text: string; faster: string; slower: string }; // CSS colours
}

/** width of one ray in pixels; narrower looks finer and costs more */
const RAY = 5;
const SPRITE_HEIGHT = 256;

type Stop = [at: number, colour: string];

// one ray, top to bottom: nothing, then violet, then green, a bright rim at the lower edge, and a
// quick fall-off below it. drawn stretched to whatever height each ray needs.
const GREEN: Stop[] = [
  [0, 'rgba(120, 70, 190, 0)'],
  [0.3, 'rgba(110, 80, 200, 0.22)'],
  [0.62, 'rgba(40, 190, 130, 0.5)'],
  [0.9, 'rgba(70, 235, 150, 0.95)'],
  [0.955, 'rgba(190, 255, 215, 1)'],
  [1, 'rgba(70, 235, 150, 0)'],
];
const TEAL: Stop[] = [
  [0, 'rgba(70, 90, 200, 0)'],
  [0.35, 'rgba(60, 110, 200, 0.2)'],
  [0.7, 'rgba(40, 180, 170, 0.5)'],
  [0.92, 'rgba(80, 225, 200, 0.9)'],
  [1, 'rgba(80, 225, 200, 0)'],
];
const VIOLET: Stop[] = [
  [0, 'rgba(160, 60, 170, 0)'],
  [0.4, 'rgba(150, 70, 190, 0.3)'],
  [0.8, 'rgba(120, 110, 220, 0.6)'],
  [0.94, 'rgba(150, 170, 240, 0.8)'],
  [1, 'rgba(150, 170, 240, 0)'],
];

interface Curtain {
  stops: Stop[];
  /** how far down the screen the lower edge hangs, as a fraction of the height */
  base: number;
  /** how far the edge swings above and below that */
  swing: number;
  /** how many folds fit across the screen */
  folds: number;
  /** how tall the rays are, as a fraction of the height */
  reach: number;
  brightness: number;
  /** how fast the folds travel sideways; the sign is the direction */
  drift: number;
  phase: number;
}

// back to front
const CURTAINS: Curtain[] = [
  { stops: VIOLET, base: 0.36, swing: 0.05, folds: 2.2, reach: 0.44, brightness: 0.3, drift: -0.05, phase: 4.0 },
  { stops: TEAL, base: 0.52, swing: 0.07, folds: 3.1, reach: 0.5, brightness: 0.34, drift: 0.035, phase: 1.3 },
  { stops: GREEN, base: 0.7, swing: 0.09, folds: 1.7, reach: 0.66, brightness: 0.46, drift: 0.06, phase: 0 },
];

const STARS = 46;
const starX = new Float32Array(STARS);
const starY = new Float32Array(STARS);
const starGlow = new Float32Array(STARS);

let sprites: HTMLCanvasElement[] | null = null;
let clock = 0;
let darkFor = '';
let dark = true;

function sprite(stops: Stop[]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = SPRITE_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const fade = ctx.createLinearGradient(0, 0, 0, SPRITE_HEIGHT);
  for (const [at, colour] of stops) fade.addColorStop(at, colour);
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 1, SPRITE_HEIGHT);
  return canvas;
}

function setUp(): void {
  sprites = CURTAINS.map(curtain => sprite(curtain.stops));
  // the same sky every time, so it does not jump when the screen comes back to it
  let seed = 20261005;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < STARS; i++) {
    starX[i] = random();
    starY[i] = random() * 0.8;
    starGlow[i] = 0.2 + random() * 0.5;
  }
}

/** light adds up on a dark screen; on a pale colour scheme that would wash out to nothing */
function isDark(background: string): boolean {
  if (background !== darkFor) {
    darkFor = background;
    const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(background);
    dark = !hex || parseInt(hex[1], 16) + parseInt(hex[2], 16) + parseInt(hex[3], 16) < 380;
  }
  return dark;
}

export function draw(ctx: CanvasRenderingContext2D, data: AnimationData): void {
  if (!sprites) setUp();
  const { width: w, height: h, colours } = data;

  ctx.fillStyle = colours.background;
  ctx.fillRect(0, 0, w, h);

  // the display stirs a little faster at speed, and never stops
  clock += data.dt * (1 + Math.min(Math.max(data.speed, 0), 300) / 500);
  const t = clock;

  ctx.fillStyle = colours.text;
  for (let i = 0; i < STARS; i++) {
    ctx.globalAlpha = starGlow[i] * (0.55 + 0.45 * Math.sin(t * 0.9 + i * 2.4));
    ctx.fillRect(starX[i] * w, starY[i] * h, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
  }

  ctx.globalCompositeOperation = isDark(colours.background) ? 'lighter' : 'source-over';
  for (let c = 0; c < CURTAINS.length; c++) {
    const curtain = CURTAINS[c];
    const image = sprites![c];
    const travel = t * curtain.drift * 6.2832;
    for (let x = 0; x < w; x += RAY) {
      const u = x / w;
      const along = u * curtain.folds * 6.2832 + travel + curtain.phase;
      // the hanging edge: one broad fold with a smaller, slower one riding on it
      const edge = h * (curtain.base + curtain.swing * (0.65 * Math.sin(along) + 0.35 * Math.sin(along * 2.3 - t * 0.17 + 1.7)));
      // patches of brightness that wander along the curtain
      const patch = 0.5 + 0.5 * Math.sin(u * 7.1 - t * 0.19 + curtain.phase * 1.9);
      // where the curtain folds back on itself there is more of it to look through
      const fold = 0.72 + 0.28 * Math.abs(Math.cos(along));
      // the rays themselves, flickering a little out of step with their neighbours
      const ray = 0.58 + 0.42 * Math.sin(u * 83 + t * 1.6 + 2.2 * Math.sin(u * 17 - t * 0.6 + c));
      const glow = curtain.brightness * (0.22 + 0.78 * patch * patch) * fold * ray;
      if (glow < 0.012) continue;
      const height = h * curtain.reach * (0.5 + 0.5 * patch) * (0.86 + 0.14 * ray);
      ctx.globalAlpha = glow;
      ctx.drawImage(image, x, edge - height, RAY, height);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
