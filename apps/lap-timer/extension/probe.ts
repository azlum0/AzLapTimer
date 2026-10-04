// Runs the telemetry half on its own, with no Car Thing and no desktop app: it reads the sim,
// prints what it sees, and serves the screen's messages on a local websocket so the page can be
// watched in a browser at http://localhost:5173/?ws=ws://127.0.0.1:8765
//
//   bun run probe           read whichever sim is running
//   bun run probe --demo    drive made-up laps instead

import type { Reference } from '../src/shared/engine.ts';
import { isCommand, type Frame, type Outbound } from '../src/shared/protocol.ts';
import { Simulator } from '../src/shared/simulator.ts';
import { Runtime } from './core.ts';
import { SOURCES } from './sources/index.ts';
import type { SourceFactory } from './sources/types.ts';

const PORT = 8765;

function demo(): SourceFactory {
  return {
    name: 'Demo',
    open() {
      const simulator = new Simulator(Date.now());
      let last = performance.now();
      let ticks = 0;
      return {
        poll() {
          const now = performance.now();
          const sample = simulator.step(Math.min((now - last) / 1000, 0.1));
          last = now;
          ticks++;
          return sample;
        },
        pulse: () => ticks,
        close() {},
      };
    },
  };
}

const clock = (seconds: number | null): string => {
  if (seconds === null) return '--:--.---';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(3).padStart(6, '0')}`;
};

const sockets = new Set<WebSocket>();
const bests = new Map<string, Reference>();
let latest: Frame | null = null;

const runtime = new Runtime(
  {
    log: message => console.log(`[lap-timer] ${message}`),
    emit(message: Outbound) {
      if (message.t === 'f') latest = message;
      else
        console.log(
          `[lap-timer] ${message.track || 'no track'} / ${message.car || 'no car'}: ${message.laps.length} laps`,
        );
      const text = JSON.stringify(message);
      for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) socket.send(text);
    },
    watched: () => true,
    loadBest: key => bests.get(key) ?? null,
    saveBest: (key, best) => void (best ? bests.set(key, best) : bests.delete(key)),
    saveRefMode() {},
  },
  Deno.args.includes('--demo') ? [demo()] : SOURCES,
);
runtime.start();

setInterval(() => {
  const f = latest;
  if (!f?.sim) return console.log('[lap-timer] waiting for a sim');
  if (!f.live) return console.log(`[lap-timer] ${f.sim}: not on track`);
  const delta = f.delta === null ? 'no reference' : `${f.delta >= 0 ? '+' : ''}${f.delta.toFixed(2)}`;
  console.log(`[lap-timer] ${f.sim} lap ${f.lap} ${clock(f.time)} ${delta} ${(f.speed * 3.6).toFixed(0)} km/h`);
}, 1000);

Deno.serve(
  { hostname: '127.0.0.1', port: PORT, onListen: () => console.log(`[lap-timer] ws://127.0.0.1:${PORT}`) },
  request => {
    if (request.headers.get('upgrade') !== 'websocket') return new Response('lap timer probe', { status: 200 });
    const { socket, response } = Deno.upgradeWebSocket(request);
    const send = (message: Outbound) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(message));
    socket.onopen = () => void sockets.add(socket);
    socket.onclose = () => void sockets.delete(socket);
    socket.onmessage = event => {
      try {
        const command: unknown = JSON.parse(String(event.data));
        if (isCommand(command)) runtime.command(command, send);
      } catch {
        // not ours
      }
    };
    return response;
  },
);
