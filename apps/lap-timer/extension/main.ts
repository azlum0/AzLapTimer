import { asJson, defineExtension, json } from '@bridgething/extension';
import { decodeReference, encodeReference } from '../src/shared/codec.ts';
import type { Reference } from '../src/shared/engine.ts';
import { isCommand, REF_MODES, type RefMode } from '../src/shared/protocol.ts';
import { Runtime } from './core.ts';
import { SOURCES } from './sources/index.ts';
import { releaseOwnConsole } from './win32.ts';

const BEST_PREFIX = 'best:';
const REF_MODE_KEY = 'refMode';

let runtime: Runtime | undefined;

// before anything else, so the window is gone as soon as it appears
let consoleReleased = false;
try {
  consoleReleased = releaseOwnConsole();
} catch {
  // a console window left open is the worst that happens
}

defineExtension({
  async start(ctx) {
    const bests = new Map<string, Reference>();
    let ready: Runtime | undefined;

    ctx.on('device', event => {
      if (event.type === 'disconnected' || !event.device.active) return;
      ready?.command({ t: 'hello' }, message => event.device.send(json(message)));
    });
    ctx.on('message', (device, message) => {
      const command = asJson(message);
      if (isCommand(command)) ready?.command(command, reply => device.send(json(reply)));
    });

    // every stored best has to be in hand before the first lap, or a slower one could replace it
    for (const key of await ctx.kv.list()) {
      if (!key.startsWith(BEST_PREFIX)) continue;
      const best = decodeReference(await ctx.kv.get(key));
      if (best) bests.set(key.slice(BEST_PREFIX.length), best);
    }
    const stored = await ctx.kv.get<RefMode>(REF_MODE_KEY);
    const failed = (what: string) => (error: unknown) => ctx.log.warn(`could not ${what}: ${error}`);

    ready = runtime = new Runtime(
      {
        log: message => ctx.log.info(message),
        emit: message => ctx.broadcast(json(message)),
        watched: () => ctx.devices.some(device => device.active),
        loadBest: key => bests.get(key) ?? null,
        saveBest(key, best) {
          if (best) {
            bests.set(key, best);
            ctx.kv.set(BEST_PREFIX + key, encodeReference(best)).catch(failed('save the best lap'));
          } else {
            bests.delete(key);
            ctx.kv.delete(BEST_PREFIX + key).catch(failed('clear the best lap'));
          }
        },
        saveRefMode: mode => void ctx.kv.set(REF_MODE_KEY, mode).catch(failed('save the reference mode')),
      },
      SOURCES,
      stored && REF_MODES.includes(stored) ? stored : 'best',
    );
    runtime.start();
    ctx.log.info(`lap timer up with ${bests.size} stored best laps${consoleReleased ? ', console window closed' : ''}`);
  },
  stop() {
    runtime?.stop();
  },
});
