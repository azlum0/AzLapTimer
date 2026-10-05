# This project ships a native extension

`manifest.json` declares an `extension` block, so this bundle has two halves.

- `src/` is the webapp, running in the device's chromium kiosk.
- `extension/` is a Deno process on the desktop. The bridgething desktop app
  spawns it while the app is installed and enabled, with or without a Car Thing
  connected.

The two halves talk over the daemon's forward surface: `client.forward` in the
webapp, `device.send` and `ctx.on('message', ...)` in the extension. The daemon
delivers a forward while this webapp is the active one on that device.

Host access belongs in the extension, an ordinary Deno program with `npm:`,
`jsr:`, and `node:` available. Keep `src/` a view over what it sends. The webapp
also runs with nothing attached, so check `capabilities.available.forward` and
give the user something useful when it is false.

`manifest.json` starts with `"permissions": ["all"]`. Narrow it to the Deno
permissions you use before you publish.

The `ctx` contract, the permission grammar, the dev loop, and the gotchas:
`.claude/skills/bridgething/reference/extension.md`.

## How the lap timer is laid out

- `src/shared/` is imported by both halves, so it must stay free of DOM, Deno, and React.
  `engine.ts` turns `Sample`s into lap times and the live delta; `protocol.ts` is every message
  that crosses between the halves. Imports inside it carry the `.ts` extension because Deno
  needs it.
- `extension/sources/` has one reader per sim. Each takes a plain `DataView`, so it is tested
  against a buffer in `test/readers.test.ts`; only `win32.ts` touches FFI.
- A reader may fill `Sample.simDelta` with the sim's own delta per reference mode. The engine
  then shows that in place of its own, because drivers compare the screen with the sim's dash and
  two differently-built deltas never agree. Only iRacing does so far.
- Offsets come from `struct()` in `extension/layout.ts`, with fields listed in the order of the
  sim's own header. When a sim changes its struct, edit the field list, never a number.
- The extension owns the timing state: laps, best laps (in `ctx.kv`), the reference mode. The
  screen owns how it looks: `src/settings.ts` keeps the display choices in `client.store`, and a
  colour scheme is applied by setting the base theme variables on the root element, which every
  mixed colour in `index.css` follows.
- Moving backgrounds live in the repo's top-level `Assets` folder, not in `src`. `src/animations.ts`
  globs them in, so adding one is dropping a file there. They are bundled but deliberately left
  out of both tsconfigs: they are often written by a chat model and should not have to pass the
  app's strict settings. `src/background.tsx` runs them and stops one that throws.
- Sizes and colours that a utility class and a caller might both set go through a prop
  (`Label size`, `bright`), because two classes for the same property resolve by stylesheet
  order, not by the order they are written.
- `extension/probe.ts` runs the telemetry half with no Car Thing, serving the same messages on a
  local websocket; the page takes them with `?ws=`. `?demo` runs made-up laps in the page.

`bun run test` and `bun run typecheck` cover both halves. `tsconfig.extension.json` checks
`extension/` against the Deno types.
