// Rosso: a racing-red flag rippling in the wind, with a yellow band and a white pinstripe slanting
// across it. Light and shadow run along the folds of the cloth. The middle of the screen is held
// darker so the numbers stay clear, and the flag flies harder with the car's speed.

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

/** width of one strip of cloth in pixels; narrower looks smoother and costs more */
const STRIP = 5;
/** how many steps of light there are between the shadow of a fold and its crest */
const SHADES = 14;

/** every shade from `dark` to `light`, worked out once */
function ramp(dark: number[], light: number[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < SHADES; i++) {
    const f = i / (SHADES - 1);
    const mix = (c: number) => Math.round(dark[c] + (light[c] - dark[c]) * f);
    out.push(`rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`);
  }
  return out;
}

/** how steeply the band climbs: pixels up for each pixel across */
const SLOPE = 0.62;

const RED = ramp([34, 0, 4], [196, 8, 20]);
const YELLOW = ramp([112, 84, 0], [255, 212, 0]);
const WHITE = ramp([104, 100, 96], [240, 236, 228]);

// what each strip of cloth is doing this frame, so the band can follow the red beneath it
const level = new Uint8Array(400);
const lift = new Float32Array(400);

let wind = 0;
let shade: HTMLCanvasElement | null = null;
let shadeFor = '';

/** a soft patch of the background colour over the middle of the screen, drawn once and reused */
function shadeOver(background: string, w: number, h: number): HTMLCanvasElement {
  if (shade && shadeFor === background) return shade;
  shade ??= document.createElement('canvas');
  shade.width = w / 4;
  shade.height = h / 4;
  shadeFor = background;
  const ctx = shade.getContext('2d')!;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, shade.width, shade.height);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, shade.width, shade.height);
  // keep the colour and thin it out toward the edges, so the cloth shows through there
  ctx.globalCompositeOperation = 'destination-in';
  const fade = ctx.createRadialGradient(
    shade.width / 2,
    shade.height * 0.52,
    0,
    shade.width / 2,
    shade.height * 0.52,
    shade.width * 0.64,
  );
  fade.addColorStop(0, 'rgba(0, 0, 0, 0.84)');
  fade.addColorStop(0.5, 'rgba(0, 0, 0, 0.66)');
  fade.addColorStop(1, 'rgba(0, 0, 0, 0.06)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, shade.width, shade.height);
  return shade;
}

export function draw(ctx: CanvasRenderingContext2D, data: AnimationData): void {
  const { width: w, height: h, colours } = data;

  const pace = Math.min(Math.max(data.speed, 0), 300) / 300;
  wind += data.dt * (1.1 + 2.6 * pace);
  // a stiffer breeze makes deeper folds
  const depth = 0.75 + 0.5 * pace;

  let strips = 0;
  for (let x = 0; x < w; x += STRIP) {
    const u = x / w;
    // two sets of folds travelling along the cloth, one broad and slow, one tight and quick
    const broad = u * 9 - wind;
    const tight = u * 23 - wind * 1.7 + 1.3;
    // how much this strip faces the light: its crests are bright, its hollows are in shadow
    const lit = 0.5 + depth * (0.32 * Math.cos(broad) + 0.15 * Math.cos(tight));
    level[strips] = Math.min(Math.max(Math.round(lit * (SHADES - 1)), 0), SHADES - 1);
    // the cloth lifts and drops with the folds, which bends anything printed on it
    lift[strips] = depth * (16 * Math.sin(broad) + 6 * Math.sin(tight));
    ctx.fillStyle = RED[level[strips]];
    ctx.fillRect(x, 0, STRIP, h);
    strips++;
  }

  // the band runs from the foot of the screen on the left up to the right-hand edge. leaning the
  // page instead of stepping each strip keeps its edges clean.
  ctx.setTransform(1, -SLOPE, 0, 1, 0, h * 1.12);
  for (let i = 0; i < strips; i++) {
    ctx.fillStyle = YELLOW[level[i]];
    ctx.fillRect(i * STRIP, lift[i], STRIP + 0.5, 84);
    ctx.fillStyle = WHITE[level[i]];
    ctx.fillRect(i * STRIP, lift[i] + 98, STRIP + 0.5, 11);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  ctx.drawImage(shadeOver(colours.background, w, h), 0, 0, w, h);
}
