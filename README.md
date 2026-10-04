# Az Lap Timer

A predictive lap timer for sim racing on a Spotify Car Thing running
[bridgething](https://bridgething.com), in the style of a Racelogic VBOX LapTimer:
a live delta against your best lap, lap times, and speed, read from the sim on your PC.

## How it works

```text
   sim (PC)                 extension (PC)                   Car Thing
┌────────────┐  shared   ┌──────────────────┐   USB    ┌──────────────────┐
│ iRacing,   │──memory──►│ reads telemetry, │─────────►│ draws the screens│
│ LMU, AMS2, │           │ times the laps,  │ forward  │ 800x480          │
│ RaceRoom   │           │ keeps best laps  │◄─────────│ sends settings   │
└────────────┘           └──────────────────┘          └──────────────────┘
```

The app has two halves, both in `apps/lap-timer`:

- `extension/` runs on the PC as a Deno process started by the bridgething desktop app. It
  finds whichever sim is running, reads its shared memory, times the laps, and stores your best
  lap for each car and track.
- `src/` runs on the Car Thing and draws what the extension sends.

The delta compares your time into the lap with the reference lap's time at the same point on
track. The LED strip compares speed the same way: green builds right when you are carrying more
speed than the reference did there, red builds left when carrying less.

## Screens and controls

| Control         | Does                                         |
| --------------- | -------------------------------------------- |
| Preset 1        | Delta: live gap to the reference, predicted  |
| Preset 2        | Laps: current, last, session best, lap list  |
| Preset 3        | Speed: speedometer and top speed this lap    |
| Preset 4        | Options: Timing page, press again for Display |
| Dial            | Step through the screens                     |
| Back            | Return to Delta                              |
| Tap the screen  | Next timing screen                           |

Crossing the line holds the finished lap time on screen for a few seconds. The reference can be
your best ever for the car and track (kept between sessions), the session best, or the last lap.
A lap through the pits, or one the sim invalidates, is listed but never becomes the reference.

The Timing page picks the reference lap, switches between the sim and demo laps, and clears the
best lap or resets the session. The Display page picks one of six colour schemes, whether the
delta colours the digits or floods the whole screen, km/h or mph, how much speed each LED stands
for, and how long a finished lap stays up. Display choices are kept on the Car Thing.

## Sims

| Sim              | Setup needed                                                        |
| ---------------- | ------------------------------------------------------------------- |
| iRacing          | None                                                                |
| Le Mans Ultimate | None, on a build that has the `LMU_Data` shared memory interface    |
| Automobilista 2  | Options > System > Shared Memory > `Project CARS 2`                 |
| RaceRoom         | None                                                                |

In iRacing the delta shown is iRacing's own, the same one the car's dash and overlays read, so
all of them agree. "Best ever" there means the best lap iRacing has stored for the car and track.
The other sims have no delta of their own, so theirs is worked out from the laps the timer has
recorded.

Adding a sim means one file in `apps/lap-timer/extension/sources/` that turns its telemetry into
a `Sample`, plus a line in `sources/index.ts`.

## Try it with no Car Thing

```sh
bun install
bun run dev
```

Open <http://localhost:5173/?demo> for made-up laps. Keys `1` to `4` and `Escape` stand in for the
buttons, and shift + scroll for the dial.

To watch a real sim in the browser, run the telemetry half on its own in a second terminal and
open <http://localhost:5173/?ws=ws://127.0.0.1:8765>:

```sh
bun run --cwd apps/lap-timer probe
```

The probe prints what it reads once a second, which is also the quickest way to check a sim is
being picked up.

## Put it on the Car Thing

1. Flash the Car Thing from <https://bridgething.com> (Chrome, USB-C cable).
2. Install the bridgething desktop app on the sim PC and leave the Car Thing plugged in over USB.
3. Build and package:

   ```sh
   bun run build
   bun run share
   ```

4. In the desktop app, open the store screen, find **install a local bundle**, and pick
   `apps/lap-timer/Lap-Timer-<version>.zip`. The desktop app copies the screen half to the Car
   Thing and keeps the extension half for itself, so the timer works whenever the desktop app is
   open.

`bun run push` on its own only copies the screen half. The desktop app then lists the app with
"extension missing", because it was never handed the bundle; installing the zip as above fixes it.

While developing, `bun run dev:device` does the same job without the desktop app: it installs the
app, shows the dev server on the Car Thing's screen, and runs the extension from source.

## Commands

```sh
bun run dev                        # dev server, plus the extension under Deno
bun run dev:device                 # the same, shown on the Car Thing
bun run push                       # build and install the screen half on the Car Thing
bun run --cwd apps/lap-timer test       # lap engine and sim reader tests
bun run --cwd apps/lap-timer typecheck
bun run --cwd apps/lap-timer probe      # telemetry half on its own
```

`bun run check` and `bun run publish` call `zip`, which Windows does not ship. They run in the
GitHub workflows; locally on Windows use the commands above.
