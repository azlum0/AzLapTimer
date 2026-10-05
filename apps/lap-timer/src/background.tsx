import { useEffect, useRef } from 'react';
import type { AnimationData, Draw } from './animations';
import { SCHEMES, type SchemeId } from './settings';
import type { Frame } from './shared/protocol';

const WIDTH = 800;
const HEIGHT = 480;
/** half the display's refresh rate: smooth enough behind the numbers, and it leaves the processor for them */
const FRAME_MS = 1000 / 30;

/**
 * Runs an animation on a canvas behind the timing screens. The animation is someone else's code,
 * so a frame that throws stops the animation and leaves the timer running.
 */
export function Background({ draw, frame, scheme }: { draw: Draw; frame: Frame | null; scheme: SchemeId }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // the loop outlives any one render, so it reads what is current through these
  const latest = useRef({ frame, scheme });
  latest.current = { frame, scheme };

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const started = performance.now();
    let last = started;
    let request = 0;
    const tick = (now: number) => {
      request = requestAnimationFrame(tick);
      if (now - last < FRAME_MS - 2) return;
      const { frame, scheme } = latest.current;
      const colours = SCHEMES[scheme];
      const data: AnimationData = {
        time: (now - started) / 1000,
        dt: Math.min((now - last) / 1000, 0.1),
        width: WIDTH,
        height: HEIGHT,
        live: frame?.live ?? false,
        speed: frame?.live ? frame.speed * 3.6 : 0,
        delta: frame?.live ? frame.delta : null,
        colours: { background: colours.screen, text: colours.fg, faster: colours.faster, slower: colours.slower },
      };
      last = now;
      try {
        ctx.save();
        draw(ctx, data);
        ctx.restore();
      } catch (error) {
        cancelAnimationFrame(request);
        ctx.restore();
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        console.error('the background animation failed and has been stopped', error);
      }
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [draw]);

  return <canvas ref={canvas} width={WIDTH} height={HEIGHT} className="pointer-events-none absolute inset-0" />;
}
