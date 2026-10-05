/** what a background is handed on every frame */
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

export type Draw = (ctx: CanvasRenderingContext2D, data: AnimationData) => void;

export interface Animation {
  id: string;
  label: string;
  draw: Draw;
}

// every file in the repo's Assets folder that exports a `draw` function is a background, named
// after the file. they are bundled but never type-checked with the app, so a file written by a
// chat model does not have to satisfy the app's stricter compiler settings.
const files = import.meta.glob<{ draw?: unknown }>('../../../Assets/*.ts', { eager: true });

export const ANIMATIONS: readonly Animation[] = Object.entries(files)
  .flatMap(([path, file]) => {
    const id = path.slice(path.lastIndexOf('/') + 1, -'.ts'.length).toLowerCase();
    return typeof file.draw === 'function' ? [{ id, label: id.replace(/[-_]+/g, ' '), draw: file.draw as Draw }] : [];
  })
  .sort((a, b) => a.label.localeCompare(b.label));
