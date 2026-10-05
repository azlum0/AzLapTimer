# Az Lap Timer

A predictive lap timer for sim racing on a Spotify Car Thing running [bridgething](https://bridgething.com). The repo is a bun workspace in the shape bridgething's scaffolder produces: one app, `apps/lap-timer`, plus the pipeline that publishes it as a store catalog on GitHub Pages.

The README is for people using it. This file is for working on it.

## Layout

```text
apps/lap-timer/
  src/              the screen half: a React page in the Car Thing's kiosk browser
    shared/         code both halves import: engine.ts (lap timing), protocol.ts (messages)
    screens.tsx     every screen and both options pages
    settings.ts     display choices, kept in the device's store
    animations.ts   loads the moving backgrounds from Assets/
  extension/        the PC half: a Deno process the bridgething desktop app runs
    sources/        one reader per sim
    core.ts         polls the sim, runs the engine, sends frames
    probe.ts        runs the PC half alone, serving a local websocket
  scripts/          push, share, deploy
  test/             bun tests for the engine and the sim readers
Assets/             moving backgrounds: each .ts file exporting `draw` is one
```

`apps/lap-timer/CLAUDE.md` goes deeper on the split between the halves and the rules inside each.

## How it fits together

The extension finds whichever sim is running, reads its shared memory about sixty times a second, turns each reading into a `Sample`, and feeds the `LapEngine`. The engine produces a `Frame` (what the screen draws) about thirty times a second and a `Session` (laps, bests, reference mode) when something changes. Both go to the screen over bridgething's forward surface. The screen sends back `Command`s.

- The extension owns timing state: laps, best laps (stored per sim, track, and car), the reference mode. Restarting it starts the lap list again, which is intended.
- The screen owns how it looks. Its settings live in the device's own store.
- In iRacing the delta shown is the sim's own (`Sample.simDelta`), because drivers compare the screen with the car's dash and two differently built deltas never agree. Other sims get the delta the engine works out from recorded laps. A new sim that publishes its own delta should pass it through the same way.

## Commands

Run from the repo root unless noted.

```sh
bun run dev                             # dev server on :5173, plus the extension under Deno
bun run --cwd apps/lap-timer test       # engine and reader tests
bun run --cwd apps/lap-timer typecheck  # both halves
bun run --cwd apps/lap-timer probe      # the PC half alone; add --demo for made-up laps
bun run push                            # build, install the screen half on the Car Thing
bun run --cwd apps/lap-timer deploy     # push, then swap the extension into the desktop app and restart it
bun run bump lap-timer <patch|minor>  -m "note"   # version, manifest, and changelog together
```

`?demo` on the page runs made-up laps with nothing attached. `?ws=ws://127.0.0.1:8765` feeds it from the probe. `?sleep=5` shortens the three minute sleep timer.

## Checking a change

- Run the tests and the typecheck.
- Look at it. The screen is 800x480 and never resizes; anything visual needs looking at at that size, with demo laps. A demo lap takes about 75 seconds and there is no delta until one is on the board.
- For anything about performance or the device itself, check on the device. Its browser answers the Chrome DevTools protocol at `bridgething.local:9222` over USB, which gives screenshots, key presses, and frame timing without touching the screen. `.claude/skills/bridgething/reference/develop.md` has a working example.
- A dev server pointed at a connected Car Thing shares that device's settings store. Changing display options in the browser changes them on the real device.
- Running the dev server while the desktop app is also running the extension gives the screen two sets of frames. Use the built app served as static files, or the probe, to look at things without a second extension.

Only iRacing has been driven with. The Le Mans Ultimate, Automobilista 2, and RaceRoom readers are written from each sim's published layout and tested against made-up buffers.

## Deploying

A screen-only change needs `bun run push`. A change under `extension/` or `src/shared/` needs `deploy`, which restarts the extension.

The desktop app only takes an extension from a zip installed through its own window (`bun run share` makes the zip). `deploy` writes over the copy it unpacked, so the desktop app's label keeps the version of the last zip while running the new code.

## The device

Listen with `keydown` and `wheel` handlers on `window`.

| Control      | Event                                 |
| ------------ | ------------------------------------- |
| Preset 1-4   | `keydown` key `"1"` `"2"` `"3"` `"4"` |
| Mode         | `keydown` key `"m"`                   |
| Back         | `keydown` key `"Escape"`              |
| Rotary wheel | `wheel` with horizontal `deltaX`      |
| Touch        | pointer and touch events              |

Mode is left alone: the launcher gesture uses it. The device has four cores and about 200 MB of free memory, plays H.264 video with hardware help, and held 60 frames a second with a canvas background drawing 480 images a frame.

The SDK, the extension contract, and the manifest fields are covered by the bridgething skill in `.claude/skills/bridgething/`.

## Sim readers

- Each reader takes a plain `DataView`, so it is tested against a buffer. Only `extension/win32.ts` touches FFI.
- Offsets come from `struct()` in `extension/layout.ts`, with fields listed in the order of the sim's own header. When a sim changes its struct, edit the field list, never a number.
- Each reader checks what it finds (a size, a version, an offset the sim publishes) and stands down with a log line if it does not match. Keep that: a wrong offset should mean a sim that is not picked up, never wrong numbers on screen.
- The sims' headers are not in the repo and should not be added. Le Mans Ultimate's and Automobilista 2's ship inside the game installs under `Support/`; Le Mans Ultimate's forbids redistribution.

## Moving backgrounds

Files in `Assets/` are bundled into the app but left out of both tsconfigs on purpose: they are often written by a chat model and should not have to pass the app's strict settings. `Assets/README.md` is the contract. `src/background.tsx` runs them at thirty frames a second and stops one that throws.

## Versions and publishing

- `apps/lap-timer/public/manifest.json` holds the app's `id`. Never change it: the device keys the install and its stored settings on it.
- Move the version with `bun run bump`, never by hand. It writes the manifest and `package.json` together and opens the changelog section.
- Pushing to `main` runs the publish workflow, which adds the version to the catalog on the `gh-pages` branch. A published version is immutable, so a change to the app needs a bump before it reaches `main`, or the check fails.
- `bun run check` is the whole gate and is what CI runs. It calls `zip`, which Windows does not ship, so on Windows it stops after the build; CI on Linux runs it in full.

## Windows

The scaffolded scripts were not Windows-safe. Two are patched here and a re-scaffold would undo it:

- `scripts/push.ts` worked out the project folder from `URL.pathname`, giving `E:\E:\...`. It uses `fileURLToPath` now. The symptom was `ENOENT: uv_spawn 'bun'`, which really meant a working directory that did not exist.
- `scripts/share.ts` named zip entries with backslashes, so the desktop app found no `extension/` folder and reported "extension missing". It joins with `/` now.

The desktop app starts the extension without asking Windows to keep it windowless. `releaseOwnConsole()` in `extension/win32.ts` closes the console window that results.

## Style

- Comments: terse, lowercase, the non-obvious why only, 120 columns, no em dashes. Most code needs none.
- `bun x prettier --write` with the repo's config before committing.
- Sizes and colours that both a utility class and a caller might set go through a prop, because two classes for the same property resolve by stylesheet order.
