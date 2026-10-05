// Blue and yellow: slanted livery bands in yellow, light blue, and deep blue sweeping slowly across
// the screen, with a glint of light running along them. The middle of the screen is held darker
// so the numbers stay clear, and the bands sweep faster with the car's speed.

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

/** how far the bands lean, in radians; negative rises to the right */
const SLANT = -0.5;
/** distance from one set of bands to the next, measured across them */
const REPEAT = 620;
/** long enough to cover the screen corner to corner once it is turned */
const SPAN = 1100;

// one set of bands, as [start, thickness, colour] measured across the set
const BANDS: [from: number, thick: number, colour: string][] = [
  [0, 132, 'rgba(255, 208, 0, 0.82)'],
  [144, 10, 'rgba(255, 232, 120, 0.7)'],
  [166, 40, 'rgba(60, 175, 235, 0.85)'],
  [218, 190, 'rgba(0, 78, 170, 0.9)'],
  [420, 8, 'rgba(60, 175, 235, 0.6)'],
];

let offset = 0;
let glint = 0;
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
  ctx.clearRect(0, 0, shade.width, shade.height);
  const fade = ctx.createRadialGradient(
    shade.width / 2,
    shade.height * 0.55,
    0,
    shade.width / 2,
    shade.height * 0.55,
    shade.width * 0.62,
  );
  // the same colour all the way out, only thinner, so it never tints the bands
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, shade.width, shade.height);
  ctx.globalCompositeOperation = 'destination-in';
  fade.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
  fade.addColorStop(0.55, 'rgba(0, 0, 0, 0.62)');
  fade.addColorStop(1, 'rgba(0, 0, 0, 0.08)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, shade.width, shade.height);
  ctx.globalCompositeOperation = 'source-over';
  return shade;
}

export function draw(ctx: CanvasRenderingContext2D, data: AnimationData): void {
  const { width: w, height: h, colours } = data;

  ctx.fillStyle = colours.background;
  ctx.fillRect(0, 0, w, h);

  const pace = Math.min(Math.max(data.speed, 0), 300) / 300;
  offset = (offset + data.dt * (14 + 70 * pace)) % REPEAT;
  glint = (glint + data.dt * (260 + 520 * pace)) % (SPAN * 2.4);

  // turn the page so the bands can be drawn as plain level rectangles
  ctx.translate(w / 2, h / 2);
  ctx.rotate(SLANT);
  for (let set = -2; set <= 1; set++) {
    const top = set * REPEAT + offset;
    for (let b = 0; b < BANDS.length; b++) {
      const band = BANDS[b];
      ctx.fillStyle = band[2];
      ctx.fillRect(-SPAN / 2, top + band[0], SPAN, band[1]);
    }
    // a glint running along the bands, as if the car had just passed under a light
    const along = glint - SPAN * 0.7;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(along, top, 90, 408);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.fillRect(along - 130, top, 26, 408);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  ctx.drawImage(shadeOver(colours.background, w, h), 0, 0, w, h);
}
