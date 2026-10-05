# Backgrounds

Every `.ts` file in this folder that exports a `draw` function shows up on the lap timer's Display
page as a choice under **Background**, named after the file. To add one, drop the file here and
deploy.

## What a background file looks like

```ts
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

export function draw(ctx: CanvasRenderingContext2D, data: AnimationData): void {
  // paint the whole frame
}
```

`draw` is called about thirty times a second. Anything it needs to remember between frames lives
in variables at the top of the file. If it throws, the background stops and the timer carries on.

These files are bundled into the app but not type-checked with it, so one written by a chat model
does not have to satisfy the app's stricter rules.

## Prompt for a chat model

Paste this, then describe the look you want on the last line.

```text
Write a single TypeScript file for an animated background on an 800x480 screen.
It must export exactly this, with no imports and no other dependencies:

export interface AnimationData {
  time: number;    // seconds since the animation started
  dt: number;      // seconds since the previous frame
  width: number;   // 800
  height: number;  // 480
  live: boolean;   // true while the car is being driven
  speed: number;   // km/h, 0 when not driving
  delta: number | null; // seconds vs reference lap, negative = ahead, null = nothing to compare
  colours: { background: string; text: string; faster: string; slower: string }; // CSS colours
}

export function draw(ctx: CanvasRenderingContext2D, data: AnimationData): void

Rules:
- draw() is called about 30 times a second and must paint the whole frame,
  starting by filling it with data.colours.background.
- Keep anything remembered between frames in module-level variables.
  Use data.dt for movement so speed doesn't depend on frame rate.
- Large white numbers are drawn on top of this, so keep it dark and low
  contrast, especially in the middle of the screen.
- It runs on a very weak processor. No getImageData/putImageData, no
  shadowBlur, no filters, no gradients created every frame, no new arrays
  or objects created every frame, and under about 300 shapes per frame.
- It may react to data.speed, data.delta, data.live and data.colours.

The animation I want: <describe it here>
```
