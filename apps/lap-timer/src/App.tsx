import { useEffect, useRef, useState } from 'react';
import { DeltaScreen, DisplayScreen, LapsScreen, SetupScreen, SpeedScreen, Standby, type OptionsPage } from './screens';
import { useSettings } from './settings';
import type { LapRecord, Session } from './shared/protocol';
import { useTelemetry } from './telemetry';

const SCREENS = ['delta', 'laps', 'speed', 'setup', 'display'] as const;
const SETUP = SCREENS.indexOf('setup');
const DISPLAY = SCREENS.indexOf('display');
const WHEEL_STEP_MS = 180;

/** holds a lap up for a few seconds after it finishes, the way a lap timer shows the time at the line */
function useLapFlash(session: Session | null, holdMs: number): LapRecord | null {
  const [until, setUntil] = useState(0);
  const seen = useRef<{ combo: string; count: number } | null>(null);
  const last = session?.laps.at(-1) ?? null;
  const combo = `${session?.track}|${session?.car}`;

  useEffect(() => {
    const was = seen.current;
    seen.current = { combo, count: last?.n ?? 0 };
    // laps already on the board when the screen opens are not news
    if (!was || was.combo !== combo || !last || last.n <= was.count) return;
    setUntil(performance.now() + holdMs);
    const timer = setTimeout(() => setUntil(0), holdMs);
    return () => clearTimeout(timer);
  }, [combo, last?.n]);

  return until > 0 ? last : null;
}

export default function App() {
  const telemetry = useTelemetry();
  const { frame, session, status, feed, setFeed } = telemetry;
  const [settings, update] = useSettings(telemetry.client);
  const [screen, setScreen] = useState(0);
  const flash = useLapFlash(session, settings.flashSeconds * 1000);
  const wheelAt = useRef(0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const preset = ['1', '2', '3', '4'].indexOf(event.key);
      // the fourth preset reaches both options pages: a second press turns to the other one
      if (preset === SETUP) setScreen(current => (current === SETUP ? DISPLAY : SETUP));
      else if (preset >= 0) setScreen(preset);
      else if (event.key === 'Escape') setScreen(0);
    };
    const onWheel = (event: WheelEvent) => {
      const turn = event.deltaX || event.deltaY;
      // one click of the dial can arrive as several events
      if (!turn || event.timeStamp - wheelAt.current < WHEEL_STEP_MS) return;
      wheelAt.current = event.timeStamp;
      setScreen(current => (current + (turn > 0 ? 1 : SCREENS.length - 1)) % SCREENS.length);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
    };
  }, []);

  const name = SCREENS[screen]!;
  const options = name === 'setup' || name === 'display';
  const onPage = (page: OptionsPage) => setScreen(SCREENS.indexOf(page));
  const timing = frame && frame.sim !== null && status !== 'offline';
  let body;
  if (name === 'setup') body = <SetupScreen telemetry={telemetry} onPage={onPage} />;
  else if (name === 'display') body = <DisplayScreen settings={settings} update={update} onPage={onPage} />;
  else if (!timing) body = <Standby status={status} onDemo={() => setFeed('demo')} />;
  else {
    const props = { frame, session, settings, flash };
    body =
      name === 'delta' ? (
        <DeltaScreen {...props} />
      ) : name === 'laps' ? (
        <LapsScreen {...props} />
      ) : (
        <SpeedScreen {...props} />
      );
  }

  return (
    <div
      className="relative h-full w-full bg-screen text-off-white"
      onClick={() => !options && setScreen(current => (current + 1) % SETUP)}>
      {body}
      <div className="pointer-events-none absolute top-[7px] right-7 flex items-center gap-[6px]">
        {feed === 'demo' && (
          <span className="mr-2 font-mono text-[13px] tracking-[0.18em] text-experimental">DEMO</span>
        )}
        {SCREENS.map((id, i) => (
          <div key={id} className={`h-[5px] w-[16px] ${i === screen ? 'bg-off-white' : 'bg-edge'}`} />
        ))}
      </div>
    </div>
  );
}
