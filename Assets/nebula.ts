// Nebula: clouds of glowing gas drifting past a field of stars. Each cloud is violet at its edges,
// magenta along its filaments and yellow at its core, with dark lanes of dust cutting across it.
// The gas churns slowly on its own and drifts by faster with the car's speed. The middle of the
// screen is thinned out so the numbers stay clear.

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

/** the gas is painted this many times smaller and stretched up: it is soft anyway, and far cheaper */
const SCALE = 3;
const SPRITE = 96;
/** the clouds sit on a loop this wide and come round again; wider than the screen by a margin each side */
const LOOP = 1500;
const MARGIN = 350;

type Rgb = [number, number, number];
const VIOLET: Rgb = [96, 44, 214];
const INDIGO: Rgb = [58, 30, 168];
const MAGENTA: Rgb = [244, 20, 150];
const PINK: Rgb = [255, 60, 176];
const YELLOW: Rgb = [255, 200, 36];

const enum Kind {
  Violet,
  Indigo,
  Magenta,
  Pink,
  Yellow,
  Core,
  Dust,
}

interface Puff {
  kind: Kind;
  x: number;
  y: number;
  /** half the length and half the width, in screen pixels */
  rx: number;
  ry: number;
  turn: number;
  /** how fast it turns, radians a second */
  spin: number;
  /** how far it wanders from its place, and how fast */
  wander: number;
  pace: number;
  phase: number;
  glow: number;
}

const puffs: Puff[] = [];

const STARS = 90;
const starX = new Float32Array(STARS);
const starY = new Float32Array(STARS);
const starGlow = new Float32Array(STARS);
/** nearer stars slide past faster */
const starDepth = new Float32Array(STARS);
const BRIGHT = 7;
const BRIGHT_TINT = ['#fff3c4', '#ffd0ee', '#e2d4ff'];

let sprites: HTMLCanvasElement[] | null = null;
let gas: HTMLCanvasElement | null = null;
let gasCtx: CanvasRenderingContext2D | null = null;
let clearing: HTMLCanvasElement | null = null;
let churn = 0;
let drift = 0;
let darkFor = '';
let dark = true;

// the same sky every time, so it does not jump when the screen comes back to it
let seed = 20261010;
const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const between = (low: number, high: number) => low + random() * (high - low);
const around = (spread: number) => (random() * 2 - 1) * spread;

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: Rgb, alpha: number): void {
  const fade = ctx.createRadialGradient(x, y, 0, x, y, r);
  fade.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`);
  fade.addColorStop(0.5, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha * 0.42})`);
  fade.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
  ctx.fillStyle = fade;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function blank(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE;
  canvas.height = SPRITE;
  return [canvas, canvas.getContext('2d')!];
}

/** a patch of gas: many small soft blots heaped toward the middle, with holes, fading out at the rim */
function cloud(rgb: Rgb): HTMLCanvasElement {
  const [canvas, ctx] = blank();
  const mid = SPRITE / 2;
  for (let i = 0; i < 80; i++) {
    const angle = random() * 6.2832;
    const out = Math.pow(random(), 0.75) * SPRITE * 0.38;
    blob(
      ctx,
      mid + Math.cos(angle) * out,
      mid + Math.sin(angle) * out,
      SPRITE * between(0.06, 0.2),
      rgb,
      between(0.08, 0.3),
    );
  }
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 14; i++) {
    const angle = random() * 6.2832;
    const out = random() * SPRITE * 0.4;
    blob(
      ctx,
      mid + Math.cos(angle) * out,
      mid + Math.sin(angle) * out,
      SPRITE * between(0.04, 0.11),
      [0, 0, 0],
      between(0.4, 0.9),
    );
  }
  ctx.globalCompositeOperation = 'destination-in';
  const rim = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
  rim.addColorStop(0, 'rgba(0, 0, 0, 1)');
  rim.addColorStop(0.55, 'rgba(0, 0, 0, 0.8)');
  rim.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, SPRITE, SPRITE);
  return canvas;
}

/** the hot middle of a cloud: nearly white, falling away through yellow to amber */
function core(): HTMLCanvasElement {
  const [canvas, ctx] = blank();
  const mid = SPRITE / 2;
  const fade = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
  fade.addColorStop(0, 'rgba(255, 246, 200, 1)');
  fade.addColorStop(0.18, 'rgba(255, 218, 84, 0.78)');
  fade.addColorStop(0.5, 'rgba(255, 170, 40, 0.24)');
  fade.addColorStop(1, 'rgba(255, 150, 40, 0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, SPRITE, SPRITE);
  return canvas;
}

/** what a lane of dust takes away from the gas behind it */
function dust(): HTMLCanvasElement {
  const [canvas, ctx] = blank();
  const mid = SPRITE / 2;
  for (let i = 0; i < 26; i++) {
    const angle = random() * 6.2832;
    const out = random() * SPRITE * 0.3;
    blob(
      ctx,
      mid + Math.cos(angle) * out,
      mid + Math.sin(angle) * out,
      SPRITE * between(0.08, 0.2),
      [0, 0, 0],
      between(0.25, 0.6),
    );
  }
  return canvas;
}

function add(kind: Kind, x: number, y: number, rx: number, ry: number, turn: number, glow: number): void {
  const still = kind === Kind.Core;
  puffs.push({
    kind,
    x,
    y,
    rx,
    ry,
    turn,
    spin: still ? 0 : around(0.035),
    wander: still ? 3 : between(8, 22),
    pace: between(0.16, 0.36),
    phase: random() * 6.2832,
    glow,
  });
}

function setUp(w: number, h: number): void {
  // in the order of Kind
  sprites = [cloud(VIOLET), cloud(INDIGO), cloud(MAGENTA), cloud(PINK), cloud(YELLOW), core(), dust()];

  gas = document.createElement('canvas');
  gas.width = Math.ceil(w / SCALE);
  gas.height = Math.ceil(h / SCALE);
  gasCtx = gas.getContext('2d')!;

  // how much gas to take out of the middle of the screen, where the numbers are
  clearing = document.createElement('canvas');
  clearing.width = gas.width;
  clearing.height = gas.height;
  const ctx = clearing.getContext('2d')!;
  ctx.setTransform(gas.width * 0.56, 0, 0, gas.height * 0.52, gas.width / 2, gas.height * 0.52);
  const fade = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  fade.addColorStop(0, 'rgba(0, 0, 0, 0.74)');
  fade.addColorStop(0.5, 'rgba(0, 0, 0, 0.5)');
  fade.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = fade;
  ctx.fillRect(-1, -1, 2, 2);

  // five clouds strung along the loop, high and low by turns so the middle is never crowded
  const heights = [0.2, 0.84, 0.3, 0.76, 0.12];
  const spacing = LOOP / heights.length;
  for (let c = 0; c < heights.length; c++) {
    const cx = c * spacing + around(40);
    const cy = h * heights[c] + around(20);
    const lean = around(0.5);
    const cos = Math.cos(lean);
    const sin = Math.sin(lean);

    // a wide violet haze the rest sits in
    add(
      c % 2 ? Kind.Indigo : Kind.Violet,
      cx + around(50),
      cy + around(30),
      between(190, 250),
      between(110, 150),
      lean + around(0.3),
      0.7,
    );
    add(
      c % 2 ? Kind.Violet : Kind.Indigo,
      cx + around(130),
      cy + around(60),
      between(140, 190),
      between(90, 120),
      lean + around(0.6),
      0.5,
    );
    // a magenta filament running through it, bowed a little
    for (let k = 0; k < 4; k++) {
      const along = (k - 1.5) * 78 + around(14);
      const across = 26 * Math.sin(k * 1.3 + c) + around(8);
      add(
        k % 2 ? Kind.Pink : Kind.Magenta,
        cx + cos * along - sin * across,
        cy + sin * along + cos * across,
        between(86, 124),
        between(30, 48),
        lean + around(0.35),
        between(0.72, 0.92),
      );
    }
    // the yellow heart of it
    const hx = cx + around(34);
    const hy = cy + around(18);
    add(Kind.Yellow, hx, hy, between(62, 84), between(36, 52), lean + around(0.4), 0.8);
    add(Kind.Core, hx + around(10), hy + around(8), between(24, 32), between(22, 28), 0, 0.9);
    // lanes of dust lying across the filament
    add(
      Kind.Dust,
      cx + around(70),
      cy + around(34),
      between(100, 150),
      between(16, 26),
      lean + 0.7 + around(0.4),
      0.85,
    );
    add(Kind.Dust, cx + around(110), cy + around(50), between(56, 90), between(12, 20), lean - 0.5 + around(0.5), 0.7);
  }

  for (let i = 0; i < STARS; i++) {
    starX[i] = random();
    starY[i] = random();
    starGlow[i] = between(0.2, 0.75);
    starDepth[i] = i < BRIGHT ? 1.5 : i % 3 === 0 ? 0.9 : 0.45;
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
  const { width: w, height: h, colours } = data;
  if (!sprites) setUp(w, h);

  const pace = Math.min(Math.max(data.speed, 0), 300) / 300;
  churn += data.dt * (1 + 1.4 * pace);
  drift += data.dt * (7 + 55 * pace);
  const t = churn;

  ctx.fillStyle = colours.background;
  ctx.fillRect(0, 0, w, h);

  // the faint stars, behind the gas
  ctx.fillStyle = colours.text;
  const span = w + 24;
  for (let i = BRIGHT; i < STARS; i++) {
    let x = (starX[i] * span - drift * starDepth[i] * 0.5) % span;
    if (x < 0) x += span;
    ctx.globalAlpha = starGlow[i] * (0.55 + 0.45 * Math.sin(t * 1.1 + i * 2.4));
    const size = i % 6 === 0 ? 2 : 1;
    ctx.fillRect(x - 12, starY[i] * h, size, size);
  }
  ctx.globalAlpha = 1;

  const g = gasCtx!;
  const k = 1 / SCALE;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, gas!.width, gas!.height);
  for (let pass = 0; pass < 2; pass++) {
    // the glowing gas first, each layer adding to the last, and then the dust that hides it
    g.globalCompositeOperation = pass === 0 ? 'lighter' : 'destination-out';
    for (let i = 0; i < puffs.length; i++) {
      const puff = puffs[i];
      if ((puff.kind === Kind.Dust) !== (pass === 1)) continue;
      const beat = t * puff.pace + puff.phase;
      let x = (puff.x - drift + MARGIN) % LOOP;
      if (x < 0) x += LOOP;
      x += puff.wander * Math.sin(beat) - MARGIN;
      const reach = Math.max(puff.rx, puff.ry);
      if (x < -reach || x > w + reach) continue;
      const y = puff.y + puff.wander * 0.6 * Math.cos(beat * 0.8 + puff.phase);
      // each puff swells and fades a little, out of step with the others
      const swell = 1 + 0.07 * Math.sin(beat * 1.3 + 1);
      const angle = puff.turn + puff.spin * t;
      const cos = Math.cos(angle) * 2 * k * swell;
      const sin = Math.sin(angle) * 2 * k * swell;
      g.setTransform(cos * puff.rx, sin * puff.rx, -sin * puff.ry, cos * puff.ry, x * k, y * k);
      g.globalAlpha = puff.glow * (0.8 + 0.2 * Math.sin(beat * 1.7 + puff.phase * 2));
      g.drawImage(sprites![puff.kind], -0.5, -0.5, 1, 1);
    }
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.drawImage(clearing!, 0, 0);

  ctx.globalCompositeOperation = isDark(colours.background) ? 'lighter' : 'source-over';
  ctx.drawImage(gas!, 0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';

  // a few bright stars in front, each with a small cross of glare
  for (let i = 0; i < BRIGHT; i++) {
    let x = (starX[i] * span - drift * starDepth[i] * 0.5) % span;
    if (x < 0) x += span;
    x = Math.round(x - 12);
    const y = Math.round(starY[i] * h);
    const twinkle = 0.6 + 0.4 * Math.sin(t * 1.6 + i * 1.9);
    ctx.fillStyle = BRIGHT_TINT[i % BRIGHT_TINT.length];
    ctx.globalAlpha = 0.3 * twinkle;
    ctx.fillRect(x - 5, y, 12, 2);
    ctx.fillRect(x, y - 5, 2, 12);
    ctx.globalAlpha = 0.5 + 0.4 * twinkle;
    ctx.fillRect(x - 1, y - 1, 4, 4);
  }
  ctx.globalAlpha = 1;
}
