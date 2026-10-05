// Navy and red: a deep navy field with a red glow slanting across it and a low yellow sun in the
// corner, and red and yellow dashes charging up the slant. They charge harder with the car's speed.

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

/** how far everything leans, in radians; negative rises to the right */
const SLANT = -0.5;
/** long enough to cover the screen corner to corner once it is turned */
const SPAN = 1100;
const HALF = SPAN / 2;

const DASHES = 44;
const RED = 'rgb(232, 28, 58)';
const YELLOW = 'rgb(255, 206, 0)';

// each dash: how far along the slant it is, which lane it runs in, and how it looks
const along = new Float32Array(DASHES);
const lane = new Float32Array(DASHES);
const long = new Float32Array(DASHES);
const thick = new Float32Array(DASHES);
const rush = new Float32Array(DASHES);
const glow = new Float32Array(DASHES);
const yellow = new Uint8Array(DASHES);

let ready = false;
let navy: HTMLCanvasElement | null = null;
let band: HTMLCanvasElement | null = null;
let sun: HTMLCanvasElement | null = null;
let beat = 0;

function small(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return [canvas, canvas.getContext('2d')!];
}

function relane(i: number): void {
  lane[i] = (Math.random() - 0.5) * 620;
  long[i] = 50 + Math.random() * 190;
  thick[i] = 2 + Math.random() * 6;
  rush[i] = 120 + Math.random() * 300;
  glow[i] = 0.2 + Math.random() * 0.45;
  yellow[i] = Math.random() < 0.3 ? 1 : 0;
}

/** the still parts are painted once, small, and stretched onto the screen each frame */
function setUp(w: number, h: number): void {
  ready = true;

  let ctx: CanvasRenderingContext2D;
  [navy, ctx] = small(w / 4, h / 4);
  const field = ctx.createLinearGradient(0, 0, navy.width, navy.height * 0.5);
  field.addColorStop(0, 'rgba(16, 40, 110, 0.8)');
  field.addColorStop(0.55, 'rgba(14, 30, 86, 0.5)');
  field.addColorStop(1, 'rgba(30, 14, 52, 0.3)');
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, navy.width, navy.height);

  [band, ctx] = small(1, 64);
  const red = ctx.createLinearGradient(0, 0, 0, 64);
  red.addColorStop(0, 'rgba(232, 28, 58, 0)');
  red.addColorStop(0.5, 'rgba(232, 28, 58, 0.34)');
  red.addColorStop(1, 'rgba(232, 28, 58, 0)');
  ctx.fillStyle = red;
  ctx.fillRect(0, 0, 1, 64);

  [sun, ctx] = small(128, 128);
  const disc = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  disc.addColorStop(0, 'rgba(255, 214, 40, 0.44)');
  disc.addColorStop(0.45, 'rgba(255, 190, 0, 0.36)');
  disc.addColorStop(0.5, 'rgba(255, 150, 0, 0.16)');
  disc.addColorStop(1, 'rgba(255, 110, 0, 0)');
  ctx.fillStyle = disc;
  ctx.fillRect(0, 0, 128, 128);

  for (let i = 0; i < DASHES; i++) {
    relane(i);
    along[i] = (Math.random() - 0.5) * SPAN;
  }
}

export function draw(ctx: CanvasRenderingContext2D, data: AnimationData): void {
  const { width: w, height: h, colours } = data;
  if (!ready) setUp(w, h);

  ctx.fillStyle = colours.background;
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(navy!, 0, 0, w, h);

  const pace = Math.min(Math.max(data.speed, 0), 300) / 300;
  const drive = 0.35 + 1.9 * pace;
  beat += data.dt;

  // the sun sits low in the corner, behind everything that moves, and breathes slowly
  const size = 380 * (1 + 0.035 * Math.sin(beat * 0.8));
  ctx.drawImage(sun!, w * 0.95 - size / 2, h * 0.97 - size / 2, size, size);

  // turn the page so the slanted parts can be drawn level
  ctx.translate(w / 2, h / 2);
  ctx.rotate(SLANT);
  ctx.drawImage(band!, -HALF, 30, SPAN, 170);

  for (let i = 0; i < DASHES; i++) {
    along[i] += rush[i] * drive * data.dt;
    if (along[i] - long[i] > HALF) {
      relane(i);
      along[i] = -HALF;
    }
    ctx.globalAlpha = glow[i];
    ctx.fillStyle = yellow[i] ? YELLOW : RED;
    ctx.fillRect(along[i] - long[i], lane[i], long[i], thick[i]);
    // a brighter head on each dash, so it reads as moving even in a still frame
    ctx.globalAlpha = Math.min(glow[i] + 0.3, 1);
    ctx.fillRect(along[i] - 10, lane[i], 10, thick[i]);
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
