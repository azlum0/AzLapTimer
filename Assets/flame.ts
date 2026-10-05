// Flame: fire rising from the foot of the screen in red, orange, and yellow, taller at the sides
// than in the middle so the numbers stay clear, with embers drifting up out of it.

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

/** width of one strip of flame in pixels; narrower looks finer and costs more */
const STRIP = 5;
const SPRITE_HEIGHT = 256;

type Stop = [at: number, colour: string];

// one strip of flame, tip to root. drawn stretched to whatever height each strip needs.
const RED: Stop[] = [
  [0, 'rgba(150, 10, 0, 0)'],
  [0.35, 'rgba(190, 20, 0, 0.35)'],
  [0.75, 'rgba(225, 40, 5, 0.8)'],
  [1, 'rgba(235, 55, 10, 0.95)'],
];
const ORANGE: Stop[] = [
  [0, 'rgba(230, 70, 0, 0)'],
  [0.4, 'rgba(245, 105, 5, 0.4)'],
  [0.8, 'rgba(255, 140, 15, 0.8)'],
  [1, 'rgba(255, 160, 25, 0.9)'],
];
const YELLOW: Stop[] = [
  [0, 'rgba(255, 170, 20, 0)'],
  [0.45, 'rgba(255, 205, 45, 0.45)'],
  [0.85, 'rgba(255, 230, 90, 0.85)'],
  [1, 'rgba(255, 240, 140, 0.95)'],
];

interface Layer {
  stops: Stop[];
  /** how high the flames reach in the middle of the screen, as a fraction of the height */
  reach: number;
  /** how much higher they reach at the left and right edges */
  flare: number;
  brightness: number;
  /** how many tongues fit across the screen */
  tongues: number;
  /** how quickly the tongues lick and sway */
  pace: number;
  phase: number;
}

// back to front: a tall red body, orange inside it, and a low yellow heart
const LAYERS: Layer[] = [
  { stops: RED, reach: 0.4, flare: 0.36, brightness: 0.62, tongues: 5.5, pace: 1, phase: 0 },
  { stops: ORANGE, reach: 0.27, flare: 0.3, brightness: 0.46, tongues: 8.5, pace: 1.35, phase: 2.1 },
  { stops: YELLOW, reach: 0.19, flare: 0.24, brightness: 0.42, tongues: 12, pace: 1.8, phase: 4.4 },
];

const EMBERS = 34;
const emberX = new Float32Array(EMBERS);
const emberY = new Float32Array(EMBERS);
const emberRise = new Float32Array(EMBERS);
const emberSway = new Float32Array(EMBERS);

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
  sprites = LAYERS.map(layer => sprite(layer.stops));
  for (let i = 0; i < EMBERS; i++) {
    emberX[i] = Math.random();
    emberY[i] = Math.random();
    emberRise[i] = 0.05 + Math.random() * 0.09;
    emberSway[i] = Math.random() * 6.2832;
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

  // the fire burns harder the faster the car goes
  const heat = Math.min(Math.max(data.speed, 0), 300) / 300;
  clock += data.dt * (1 + 0.6 * heat);
  const t = clock;
  const stoke = 0.86 + 0.3 * heat;

  ctx.globalCompositeOperation = isDark(colours.background) ? 'lighter' : 'source-over';
  for (let l = 0; l < LAYERS.length; l++) {
    const layer = LAYERS[l];
    const image = sprites![l];
    const p = t * layer.pace;
    for (let x = 0; x < w; x += STRIP) {
      const u = x / w;
      // 0 in the middle of the screen, 1 at either edge
      const side = Math.abs(u - 0.5) * 2;
      const across = u * layer.tongues * 6.2832 + layer.phase;
      // broad tongues that lean and wander, with quicker flicker riding on them
      const tongue = 0.5 + 0.5 * Math.sin(across + 1.4 * Math.sin(p * 0.9 + u * 5) + p * 0.35);
      const flicker = 0.5 + 0.5 * Math.sin(across * 2.7 - p * 3.1 + 2 * Math.sin(p * 1.7 + u * 11));
      const lick = 0.5 + 0.5 * Math.sin(u * 97 + p * 6.3 + l);
      const lift = 0.3 + 0.45 * tongue * tongue + 0.17 * flicker + 0.08 * lick;
      const height = h * (layer.reach + layer.flare * side * side) * lift * stoke;
      ctx.globalAlpha = layer.brightness * (0.72 + 0.28 * flicker);
      ctx.drawImage(image, x, h - height, STRIP, height);
    }
  }

  // embers: small bright specks that rise, sway, and fade as they cool
  for (let i = 0; i < EMBERS; i++) {
    emberY[i] -= emberRise[i] * data.dt * (1 + heat);
    if (emberY[i] < 0) {
      emberY[i] = 1;
      emberX[i] = Math.random();
    }
    const up = 1 - emberY[i];
    const x = (emberX[i] + 0.02 * Math.sin(t * 1.3 + emberSway[i] + up * 6)) * w;
    const y = h * (1 - up * 0.82);
    ctx.globalAlpha = 0.85 * (1 - up) * (0.6 + 0.4 * Math.sin(t * 7 + i));
    ctx.fillStyle = up < 0.45 ? 'rgb(255, 215, 90)' : 'rgb(255, 110, 30)';
    ctx.fillRect(x, y, i % 4 === 0 ? 3 : 2, i % 4 === 0 ? 3 : 2);
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
