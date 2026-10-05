// Lines streaming past, quicker with the car's speed and tinted by whether the lap is up or down.
// It doubles as the pattern for a new background: copy the interface and the `draw` export, and
// everything else is free to change.

export interface AnimationData {
  /** seconds since the animation started */
  time: number;
  /** seconds since the previous frame */
  dt: number;
  /** always 800 x 480 on the Car Thing */
  width: number;
  height: number;
  /** true while the car is being driven */
  live: boolean;
  /** kilometres per hour, 0 when not driving */
  speed: number;
  /** seconds against the reference lap, negative when ahead; null when there is nothing to compare */
  delta: number | null;
  /** the colour scheme in use, as css colours */
  colours: { background: string; text: string; faster: string; slower: string };
}

interface Streak {
  x: number;
  y: number;
  length: number;
  depth: number;
}

const STREAKS = 70;
let streaks: Streak[] = [];

function seed(width: number, height: number): void {
  streaks = Array.from({ length: STREAKS }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    length: 20 + Math.random() * 90,
    depth: 0.25 + Math.random() * 0.75,
  }));
}

/** lines streaming past, quicker with the car's speed and tinted by whether the lap is up or down */
export function draw(ctx: CanvasRenderingContext2D, data: AnimationData): void {
  const { width, height, colours } = data;
  if (streaks.length === 0) seed(width, height);

  ctx.fillStyle = colours.background;
  ctx.fillRect(0, 0, width, height);

  const pace = 40 + Math.min(data.speed, 320) * 3.2;
  const tint = data.delta === null ? colours.text : data.delta < 0 ? colours.faster : colours.slower;
  ctx.strokeStyle = tint;
  ctx.lineCap = 'round';
  for (const streak of streaks) {
    streak.x -= pace * streak.depth * data.dt;
    if (streak.x + streak.length < 0) {
      streak.x = width + Math.random() * 60;
      streak.y = Math.random() * height;
    }
    ctx.globalAlpha = 0.1 + 0.3 * streak.depth;
    ctx.lineWidth = 1 + 2 * streak.depth;
    ctx.beginPath();
    ctx.moveTo(streak.x, streak.y);
    ctx.lineTo(streak.x + streak.length * (0.4 + data.speed / 200), streak.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
