// Silver and teal: two ribbons of fine flowing lines, teal at the heart and silver at the edges,
// twisting as they run across the screen over a faint teal-to-silver wash. They flow faster with
// the car's speed.

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

/** lines in each ribbon */
const LINES = 17;
/** pixels between the points each line is drawn through; smaller is smoother and costs more */
const STEP = 16;

interface Ribbon {
  /** where it runs, as a fraction of the height */
  at: number;
  /** how far it wanders up and down, in pixels */
  wander: number;
  /** half its width at its widest, in pixels */
  spread: number;
  phase: number;
  /** which way and how briskly it flows */
  flow: number;
}

const RIBBONS: Ribbon[] = [
  { at: 0.27, wander: 30, spread: 52, phase: 0, flow: 1 },
  { at: 0.76, wander: 26, spread: 46, phase: 2.6, flow: -0.8 },
];

// teal in the middle of a ribbon, shading out to silver at its edges
const TEAL = [0, 210, 190];
const SILVER = [198, 206, 212];
const lineColour: string[] = [];
const lineGlow = new Float32Array(LINES);
for (let i = 0; i < LINES; i++) {
  const out = Math.abs(i / (LINES - 1) - 0.5) * 2;
  const mix = (a: number, b: number) => Math.round(a + (b - a) * out * out);
  lineColour.push(`rgb(${mix(TEAL[0], SILVER[0])}, ${mix(TEAL[1], SILVER[1])}, ${mix(TEAL[2], SILVER[2])})`);
  lineGlow[i] = 0.62 - 0.34 * out;
}

let run = 0;
let wash: HTMLCanvasElement | null = null;

/** a faint slanted wash, teal from the left and silver from the right, drawn once and reused */
function washOver(w: number, h: number): HTMLCanvasElement {
  if (wash) return wash;
  wash = document.createElement('canvas');
  wash.width = w / 4;
  wash.height = h / 4;
  const ctx = wash.getContext('2d')!;
  const fade = ctx.createLinearGradient(0, wash.height * 0.2, wash.width, wash.height * 0.8);
  fade.addColorStop(0, 'rgba(0, 190, 172, 0.2)');
  fade.addColorStop(0.42, 'rgba(0, 190, 172, 0)');
  fade.addColorStop(0.62, 'rgba(200, 206, 212, 0)');
  fade.addColorStop(1, 'rgba(200, 206, 212, 0.16)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, wash.width, wash.height);
  return wash;
}

export function draw(ctx: CanvasRenderingContext2D, data: AnimationData): void {
  const { width: w, height: h, colours } = data;

  ctx.fillStyle = colours.background;
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(washOver(w, h), 0, 0, w, h);

  const pace = Math.min(Math.max(data.speed, 0), 300) / 300;
  run += data.dt * (0.45 + 2.4 * pace);

  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  for (let r = 0; r < RIBBONS.length; r++) {
    const ribbon = RIBBONS[r];
    const t = run * ribbon.flow;
    for (let i = 0; i < LINES; i++) {
      // -1 at one edge of the ribbon, 1 at the other
      const across = (i / (LINES - 1) - 0.5) * 2;
      ctx.strokeStyle = lineColour[i];
      ctx.globalAlpha = lineGlow[i];
      ctx.beginPath();
      for (let x = -STEP; x <= w + STEP; x += STEP) {
        const u = x / w;
        // the path the whole ribbon follows
        const centre =
          h * ribbon.at +
          ribbon.wander * Math.sin(u * 3.3 + t * 0.55 + ribbon.phase) +
          ribbon.wander * 0.45 * Math.sin(u * 7.1 - t * 0.8 + ribbon.phase * 2);
        // the ribbon turning over as it goes: its lines close to a point and open out again
        const turn = Math.sin(u * 3.9 - t * 0.6 + ribbon.phase);
        const y = centre + across * ribbon.spread * turn + across * across * 9 * Math.cos(u * 5.3 + t);
        if (x === -STEP) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
