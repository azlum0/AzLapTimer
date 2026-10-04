import { BridgethingClient } from '@bridgething/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { daemonUrl } from './daemon';
import { LapEngine, type Reference } from './shared/engine';
import { isOutbound, type Command, type Frame, type Outbound, type Session } from './shared/protocol';
import { Simulator } from './shared/simulator';

/** where the numbers come from */
export type Feed = 'desktop' | 'demo';

/** `offline` until the desktop half answers, `waiting` while no sim is running, `parked` while not driving */
export type Status = 'offline' | 'waiting' | 'parked' | 'live';

interface Link {
  send(command: Command): void;
  close(): void;
}

const HELLO_EVERY_MS = 2000;
const SILENT_AFTER_MS = 3500;
const DEMO_FRAME_MS = 33;

/** the desktop extension, reached through the daemon on the Car Thing */
function forwardLink(client: BridgethingClient, receive: (message: Outbound) => void): Link {
  const off = client.forward.onJson(message => {
    if (isOutbound(message)) receive(message);
  });
  return {
    send: command => void client.forward.json(command).catch(() => {}),
    close: off,
  };
}

/** the probe, for watching the page in a desktop browser with no Car Thing attached */
function socketLink(url: string, receive: (message: Outbound) => void): Link {
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  const open = () => {
    socket = new WebSocket(url);
    socket.onmessage = event => {
      try {
        const message: unknown = JSON.parse(String(event.data));
        if (isOutbound(message)) receive(message);
      } catch {
        // not ours
      }
    };
    socket.onclose = () => {
      if (!closed) retry = setTimeout(open, 1000);
    };
  };
  open();
  return {
    send: command => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(command));
    },
    close() {
      closed = true;
      clearTimeout(retry);
      socket?.close();
    },
  };
}

/** made-up laps timed by the same engine the desktop half runs, so the screens can be seen with nothing attached */
function demoLink(receive: (message: Outbound) => void): Link {
  const bests = new Map<string, Reference>();
  let dirty = true;
  const engine = new LapEngine({
    loadBest: key => bests.get(key) ?? null,
    saveBest: (key, best) => void (best ? bests.set(key, best) : bests.delete(key)),
    changed: () => {
      dirty = true;
    },
  });
  const simulator = new Simulator(Date.now());
  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    // a hidden tab throttles timers, and one long step would look like a jump across the track
    let behind = Math.min((now - last) / 1000, 0.5);
    last = now;
    while (behind > 0) {
      const step = Math.min(behind, 1 / 60);
      engine.update(simulator.step(step));
      behind -= step;
    }
    if (dirty) {
      dirty = false;
      receive(engine.session());
    }
    receive(engine.frame());
  }, DEMO_FRAME_MS);
  return {
    send(command) {
      if (command.t === 'ref') engine.setRefMode(command.mode);
      else if (command.t === 'clearBest') engine.clearBest();
      else if (command.t === 'resetSession') engine.resetSession();
      else dirty = true;
    },
    close: () => clearInterval(timer),
  };
}

function initialFeed(): Feed {
  return new URLSearchParams(window.location.search).has('demo') ? 'demo' : 'desktop';
}

export interface Telemetry {
  /** null when the page is fed by the probe instead of the daemon */
  client: BridgethingClient | null;
  frame: Frame | null;
  session: Session | null;
  status: Status;
  feed: Feed;
  setFeed(feed: Feed): void;
  send(command: Command): void;
}

export function useTelemetry(): Telemetry {
  const socketUrl = useMemo(() => new URLSearchParams(window.location.search).get('ws'), []);
  // the client connects on construction, so only make one when the daemon is the route in
  const client = useMemo(() => (socketUrl ? null : new BridgethingClient({ url: daemonUrl() })), [socketUrl]);
  const [feed, setFeed] = useState<Feed>(initialFeed);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [silent, setSilent] = useState(true);
  const link = useRef<Link | null>(null);
  const heardAt = useRef(0);

  useEffect(() => {
    setFrame(null);
    setSession(null);
    setSilent(true);
    heardAt.current = 0;

    const receive = (message: Outbound) => {
      heardAt.current = performance.now();
      setSilent(false);
      if (message.t === 'f') setFrame(message);
      else setSession(message);
    };
    const made =
      feed === 'demo' ? demoLink(receive) : socketUrl ? socketLink(socketUrl, receive) : forwardLink(client!, receive);
    link.current = made;

    // forwards are dropped while the app is in the background, so keep asking until something answers
    made.send({ t: 'hello' });
    const timer = setInterval(() => {
      const quiet = performance.now() - heardAt.current;
      if (quiet > HELLO_EVERY_MS) made.send({ t: 'hello' });
      if (quiet > SILENT_AFTER_MS) setSilent(true);
    }, HELLO_EVERY_MS);

    return () => {
      clearInterval(timer);
      made.close();
      link.current = null;
    };
  }, [client, feed, socketUrl]);

  const send = useCallback((command: Command) => link.current?.send(command), []);

  const status: Status = silent || !frame ? 'offline' : !frame.sim ? 'waiting' : frame.live ? 'live' : 'parked';
  return { client, frame, session, status, feed, setFeed, send };
}
