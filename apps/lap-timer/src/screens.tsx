import { useEffect, useState } from 'react';
import { delta, lapTime, rlDelta, rlLapTime, speed, tone, unitLabel } from './format';
import { ANIMATIONS } from './animations';
import {
  backdropInUse,
  deltaStyleInUse,
  PLAIN,
  FLASH_SECONDS,
  LED_STEPS,
  SCHEMES,
  SCREEN_FILLING,
  type DeltaStyle,
  type SchemeId,
  type Settings,
} from './settings';
import type { Frame, LapRecord, RefMode, Session } from './shared/protocol';
import type { Feed, Status, Telemetry } from './telemetry';
import { Button, Cell, Choice, Digits, Field, Label, LedBar } from './ui';

const TONE = { faster: 'text-faster', slower: 'text-slower', level: 'text-off-white' } as const;
const REF_LABEL: Record<RefMode, string> = { best: 'Best', session: 'Session best', last: 'Last lap' };

export interface ScreenProps {
  frame: Frame;
  session: Session | null;
  settings: Settings;
  /** the lap that has just finished, for a few seconds after the line */
  flash: LapRecord | null;
}

/** metres per second that one led stands for */
const perLed = (settings: Settings): number => settings.ledStep * (settings.units === 'mph' ? 0.44704 : 1 / 3.6);

function Tag({ frame }: { frame: Frame }) {
  if (!frame.live) return <span className="text-experimental">Not on track</span>;
  if (frame.pit) return <span className="text-experimental">Pit lane</span>;
  if (!frame.valid) return <span className="text-warn">Lap invalid</span>;
  return null;
}

/** how far from level the delta has to be for the blended background to reach one pure colour */
const GRADIENT_FULL_SECONDS = 0.5;

/** the colour to flood the delta screen with, or null when the digits carry the colour instead */
function floodColour(style: DeltaStyle, seconds: number): string | null {
  if (style === 'flood') {
    const now = tone(seconds);
    return now === 'level' ? null : `var(--color-${now})`;
  }
  if (style === 'gradient') {
    const faster = Math.min(Math.max(0.5 - seconds / (2 * GRADIENT_FULL_SECONDS), 0), 1);
    // mixed through oklch, so half way between the two is a clean in-between hue and not a muddy grey
    return `color-mix(in oklch, var(--color-faster) ${Math.round(faster * 100)}%, var(--color-slower))`;
  }
  return null;
}

/** the predictive screen: how far up or down on the reference lap, right now */
export function DeltaScreen(props: ScreenProps) {
  return props.settings.deltaLook === 'racelogic' ? <RacelogicDelta {...props} /> : <StandardDelta {...props} />;
}

function StandardDelta({ frame, session, settings, flash }: ScreenProps) {
  const refMode = session?.refMode ?? 'best';
  const last = session?.laps.at(-1) ?? null;
  const now = tone(frame.delta);
  const showing = !flash && frame.live && frame.delta !== null;
  const style = deltaStyleInUse(settings);
  // with the screen flooded the colour is the background, so the digits go back to the text colour
  const flood = showing ? floodColour(style, frame.delta!) : null;
  const flooded = flood !== null;
  const tint = flooded || style === 'off' ? 'text-off-white' : TONE[now];

  let main;
  if (flash) {
    main = (
      <>
        <Label>Lap {flash.n}</Label>
        <Digits text={lapTime(flash.time)} size={148} className={flash.valid ? '' : 'text-soft'} />
        <div className={`h-12 ${style === 'off' ? '' : TONE[tone(session?.lastDelta)]}`}>
          {session?.lastDelta !== null && session?.lastDelta !== undefined && (
            <Digits text={delta(session.lastDelta)} size={46} />
          )}
        </div>
      </>
    );
  } else if (showing) {
    main = (
      <>
        <Label bright={flooded}>Delta to {REF_LABEL[refMode]}</Label>
        <Digits text={delta(frame.delta)} size={196} className={tint} />
      </>
    );
  } else if (frame.live) {
    main = (
      <>
        <Label>{frame.ref === null ? 'No reference lap yet' : 'Cross the line to start'}</Label>
        <Digits text={lapTime(frame.time, 1)} size={168} />
      </>
    );
  } else {
    main = (
      <>
        <Label>{last ? `Last lap ${last.n}` : 'Ready'}</Label>
        <Digits text={lapTime(last?.time)} size={148} className={last?.valid === false ? 'text-soft' : ''} />
      </>
    );
  }

  return (
    <div
      className="flex h-full flex-col px-7 pt-6 pb-4"
      style={flooded ? { background: `color-mix(in srgb, ${flood} 62%, var(--color-screen))` } : undefined}>
      <LedBar value={frame.live ? frame.deltaV : null} perLed={perLed(settings)} plain={flooded} />
      <div className="flex flex-1 flex-col items-center justify-center gap-3">{main}</div>
      <div className={`flex items-end gap-6 border-t pt-3 ${flooded ? 'border-off-white' : 'border-rule-strong'}`}>
        <Cell
          bright={flooded}
          label={
            <>
              Lap {frame.lap} {!flooded && <Tag frame={frame} />}
            </>
          }>
          <Digits text={lapTime(frame.live ? frame.time : null, 1)} size={50} />
        </Cell>
        <Cell bright={flooded} label="Predicted">
          <Digits text={lapTime(frame.live ? frame.pred : null)} size={50} className={tint} />
        </Cell>
        <Cell bright={flooded} label={REF_LABEL[refMode]}>
          <Digits text={lapTime(frame.ref)} size={50} className={flooded ? '' : 'text-near'} />
        </Cell>
      </div>
    </div>
  );
}

const RL_FONT = { fontFamily: 'Anton, Impact, "Arial Narrow", sans-serif' };
const RL_BAR_SECONDS = 2;
const RL_LEDS_PER_SIDE = 3;

/** the unit's bold condensed numerals, each digit in a cell of the same width */
function RlDigits({ text, size, className = '' }: { text: string; size: number; className?: string }) {
  return (
    <span className={`inline-flex items-baseline leading-none ${className}`} style={{ ...RL_FONT, fontSize: size }}>
      {Array.from(text, (char, i) => (
        <span
          key={i}
          className="inline-block text-center"
          style={{ width: /[0-9+−-]/.test(char) ? '0.47em' : '0.2em' }}>
          {char}
        </span>
      ))}
    </span>
  );
}

/** the six lamps above the unit's screen: red out to the left when slower, green out to the right when faster */
function RlLeds({ value, perLed, plain }: { value: number | null; perLed: number; plain: boolean }) {
  const lit = value === null ? 0 : Math.min(RL_LEDS_PER_SIDE, Math.round(Math.abs(value) / perLed));
  const slower = value !== null && value < 0;
  return (
    <div className="flex justify-center gap-[62px]">
      {Array.from({ length: RL_LEDS_PER_SIDE * 2 }, (_, i) => {
        const left = i < RL_LEDS_PER_SIDE;
        const fromCentre = left ? RL_LEDS_PER_SIDE - 1 - i : i - RL_LEDS_PER_SIDE;
        const on = left === slower && fromCentre < lit;
        // a lamp in the delta colour would vanish into a screen flooded with that same colour
        const colour = plain
          ? 'bg-off-white'
          : left
            ? 'bg-slower shadow-[0_0_18px_var(--color-slower)]'
            : 'bg-faster shadow-[0_0_18px_var(--color-faster)]';
        return <div key={i} className={`h-[26px] w-[26px] rounded-full ${on ? colour : 'bg-edge'}`} />;
      })}
    </div>
  );
}

/** the unit's delta-t bar graph: a scale, with a block growing right from the middle when behind and left when ahead */
function RlBar({ seconds }: { seconds: number | null }) {
  const reach = seconds === null ? 0 : Math.min(Math.abs(seconds) / RL_BAR_SECONDS, 1) * 50;
  return (
    <div className="relative h-[62px]">
      <div className="absolute inset-x-0 top-[10px] h-[3px] bg-off-white" />
      {[0, 25, 50, 75, 100].map(at => (
        <div
          key={at}
          className="absolute top-0 h-[13px] w-[3px] bg-off-white"
          style={{ left: `calc(${at}% - ${at === 0 ? 0 : at === 100 ? 3 : 1.5}px)` }}
        />
      ))}
      <div
        className="absolute top-[20px] bottom-0 bg-off-white"
        style={
          seconds !== null && seconds < 0 ? { right: '50%', width: `${reach}%` } : { left: '50%', width: `${reach}%` }
        }
      />
    </div>
  );
}

/**
 * The first screen drawn the way a Racelogic VBOX LapTimer draws predictive lap timing: lamps for
 * the speed difference, the delta as plus or minus seconds and hundredths with the speed beside
 * it, and the delta-t bar underneath. The unit itself shows one colour only, which is what the
 * delta colour setting gives when it is off.
 */
function RacelogicDelta({ frame, session, settings, flash }: ScreenProps) {
  const last = session?.laps.at(-1) ?? null;
  const showing = !flash && frame.live && frame.delta !== null;
  const lapCount = String(frame.lap).padStart(2, '0');
  const style = deltaStyleInUse(settings);
  const flood = showing ? floodColour(style, frame.delta!) : null;
  const flooded = flood !== null;
  const tint = (seconds: number | null | undefined) => (flooded || style === 'off' ? '' : TONE[tone(seconds)]);

  let main;
  if (flash) {
    main = (
      <>
        <RlDigits text={rlLapTime(flash.time)} size={190} />
        {session?.lastDelta !== null && session?.lastDelta !== undefined && (
          <RlDigits
            className={`self-end pb-3 ${tint(session.lastDelta)}`}
            text={rlDelta(session.lastDelta)}
            size={62}
          />
        )}
      </>
    );
  } else if (showing) {
    main = (
      <>
        <RlDigits text={rlDelta(frame.delta!)} size={204} className={tint(frame.delta)} />
        <div className="flex flex-col items-end gap-2" style={RL_FONT}>
          <RlDigits text={speed(frame.speed, settings.units).toFixed(1)} size={84} />
          <span className="text-[44px] leading-none">{settings.units === 'mph' ? 'mph' : 'km/h'}</span>
        </div>
      </>
    );
  } else {
    const time = frame.live ? rlLapTime(frame.time, 1) : rlLapTime(last?.time ?? null);
    main = (
      <>
        <RlDigits text={time} size={190} />
        <div className="flex flex-col items-end gap-3" style={RL_FONT}>
          <span className="text-[44px] leading-none">Lap</span>
          <RlDigits text={lapCount} size={64} />
        </div>
      </>
    );
  }

  return (
    <div
      className="flex h-full flex-col px-9 pt-9 pb-8"
      style={flooded ? { background: `color-mix(in srgb, ${flood} 62%, var(--color-screen))` } : undefined}>
      <RlLeds value={frame.live ? frame.deltaV : null} perLed={perLed(settings)} plain={flooded} />
      <div className="flex flex-1 items-center justify-between gap-4">{main}</div>
      <RlBar seconds={showing ? frame.delta : null} />
    </div>
  );
}

const LAPS_SHOWN = 7;

/** the lap timing screen: this lap, the last, the best, and the run of laps so far */
export function LapsScreen({ frame, session }: ScreenProps) {
  const laps = session?.laps ?? [];
  const best = session?.sessionBest ?? null;
  const last = laps.at(-1) ?? null;
  return (
    <div className="flex h-full gap-7 px-7 py-6">
      <div className="flex flex-1 flex-col justify-between">
        <Cell
          className="flex-none"
          label={
            <>
              Lap {frame.lap} <Tag frame={frame} />
            </>
          }>
          <Digits text={lapTime(frame.live ? frame.time : null, 1)} size={104} />
        </Cell>
        <Cell className="flex-none" label="Last">
          <Digits text={lapTime(last?.time)} size={64} className={last?.valid === false ? 'text-soft' : ''} />
        </Cell>
        <Cell className="flex-none" label="Session best">
          <Digits text={lapTime(best)} size={64} className="text-faster" />
        </Cell>
      </div>
      <div className="flex w-[318px] flex-col border-l border-rule-strong pl-6">
        <Label className="mb-2">Laps</Label>
        {laps.length === 0 && <div className="text-[18px] text-soft">No laps yet</div>}
        {laps
          .slice(-LAPS_SHOWN)
          .reverse()
          .map(lap => {
            const quickest = lap.valid && best !== null && Math.abs(lap.time - best) < 0.0005;
            const gap = best !== null && !quickest ? delta(lap.time - best) : '';
            return (
              <div
                key={lap.n}
                className={`flex h-[54px] items-center gap-3 border-b border-rule ${lap.valid ? '' : 'text-soft'}`}>
                <span className="w-8 font-mono text-[18px] text-soft">{lap.n}</span>
                <Digits text={lapTime(lap.time)} size={33} className={quickest ? 'text-faster' : ''} />
                <span className="ml-auto font-mono text-[18px] text-near">{lap.valid ? gap : 'INV'}</span>
              </div>
            );
          })}
      </div>
    </div>
  );
}

/** the speed screen: the speedometer, with the gap to the reference lap's speed at this point */
export function SpeedScreen({ frame, settings }: ScreenProps) {
  const { units } = settings;
  const gap = frame.live && frame.deltaV !== null ? speed(frame.deltaV, units) : null;
  const gapText = gap === null ? '' : `${gap < 0 ? '−' : '+'}${Math.abs(gap).toFixed(0)}`;
  return (
    <div className="flex h-full flex-col px-7 pt-6 pb-4">
      <LedBar value={frame.live ? frame.deltaV : null} perLed={perLed(settings)} />
      <div className="flex flex-1 items-center justify-center gap-5">
        <Digits text={speed(frame.speed, units).toFixed(0)} size={212} />
        <Label className="self-end pb-10" size={22}>
          {unitLabel(units)}
        </Label>
      </div>
      <div className="flex items-end gap-6 border-t border-rule-strong pt-3">
        <Cell label="Top this lap">
          <Digits text={frame.live ? speed(frame.vmax, units).toFixed(0) : '-'} size={50} />
        </Cell>
        <Cell label="To reference">
          <Digits
            text={gapText || '-'}
            size={50}
            className={gap === null ? 'text-near' : TONE[gap < -0.5 ? 'slower' : gap > 0.5 ? 'faster' : 'level']}
          />
        </Cell>
        <Cell
          label={
            <>
              Lap {frame.lap} <Tag frame={frame} />
            </>
          }>
          <Digits text={lapTime(frame.live ? frame.time : null, 1)} size={50} />
        </Cell>
      </div>
    </div>
  );
}

export type OptionsPage = 'setup' | 'display';

const PAGES = [
  ['display', 'DISPLAY'],
  ['setup', 'TIMING'],
] as const;

function Pages({ page, onPage }: { page: OptionsPage; onPage(page: OptionsPage): void }) {
  return (
    <div className="mr-[150px] flex gap-7 border-b border-rule-strong">
      {PAGES.map(([id, label]) => (
        <button
          key={id}
          className={`-mb-px h-11 border-b-2 font-mono text-[17px] tracking-[0.16em] ${
            id === page ? 'border-off-white text-off-white' : 'border-transparent text-soft'
          }`}
          onClick={() => onPage(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

const REF_OPTIONS = [
  ['best', 'BEST EVER'],
  ['session', 'SESSION BEST'],
  ['last', 'LAST LAP'],
] as const;
const UNIT_OPTIONS = [
  ['kmh', 'KM/H'],
  ['mph', 'MPH'],
] as const;
const LED_OPTIONS = LED_STEPS.map(step => [step, String(step)] as const);
const FLASH_OPTIONS = FLASH_SECONDS.map(seconds => [seconds, `${seconds} S`] as const);
const FEED_OPTIONS = [
  ['desktop', 'SIM'],
  ['demo', 'DEMO LAPS'],
] as const;

const STATUS_TEXT: Record<Status, string> = {
  offline: 'No link to the PC',
  waiting: 'Linked, no sim running',
  parked: 'Linked, not on track',
  live: 'Linked, on track',
};

function Confirm({ label, onConfirm }: { label: string; onConfirm(): void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <Button
      className="h-14 flex-1"
      warn={armed}
      onClick={() => {
        if (armed) onConfirm();
        setArmed(!armed);
      }}>
      {armed ? 'TAP AGAIN TO CONFIRM' : label}
    </Button>
  );
}

/** what the timer measures against, and where its numbers come from */
export function SetupScreen({
  telemetry,
  settings,
  update,
  onPage,
}: {
  telemetry: Telemetry;
  settings: Settings;
  update(change: Partial<Settings>): void;
  onPage(page: OptionsPage): void;
}) {
  const { session, status, feed, setFeed, send } = telemetry;
  const combo = [session?.track, session?.car].filter(Boolean).join(' · ');
  return (
    <div className="flex h-full flex-col gap-4 px-7 pt-4 pb-5">
      <Pages page="setup" onPage={onPage} />
      <Field label="Reference lap">
        <Choice options={REF_OPTIONS} value={session?.refMode ?? 'best'} onPick={mode => send({ t: 'ref', mode })} />
      </Field>
      <div className="flex gap-6">
        <Field className="flex-1" label="Data">
          <Choice<Feed> options={FEED_OPTIONS} value={feed} onPick={setFeed} />
        </Field>
        <Field className="flex-1" label="This car and track">
          <div className="flex gap-2">
            <Confirm label="CLEAR BEST" onConfirm={() => send({ t: 'clearBest' })} />
            <Confirm label="RESET" onConfirm={() => send({ t: 'resetSession' })} />
          </div>
        </Field>
      </div>
      <div className="flex gap-5">
        <Field className="flex-1" label="Speed in">
          <Choice options={UNIT_OPTIONS} value={settings.units} onPick={units => update({ units })} />
        </Field>
        <Field className="flex-1" label={`Each LED, ${unitLabel(settings.units)}`}>
          <Choice options={LED_OPTIONS} value={settings.ledStep} onPick={ledStep => update({ ledStep })} />
        </Field>
        <Field className="flex-1" label="Hold lap time">
          <Choice
            options={FLASH_OPTIONS}
            value={settings.flashSeconds}
            onPick={flashSeconds => update({ flashSeconds })}
          />
        </Field>
      </div>
      <div className="mt-auto flex items-end justify-between gap-6 border-t border-rule-strong pt-3">
        <div className="min-w-0">
          <div className="text-[18px] text-near">{feed === 'demo' ? 'Demo laps' : STATUS_TEXT[status]}</div>
          <div className="truncate text-[16px] text-soft">{combo || 'No car or track yet'}</div>
        </div>
        <div className="text-right">
          <Label>Best ever</Label>
          <Digits text={lapTime(session?.allTimeBest)} size={30} />
        </div>
      </div>
    </div>
  );
}

const LOOK_OPTIONS = [
  ['standard', 'STANDARD'],
  ['racelogic', 'RACELOGIC'],
] as const;
const STYLE_OPTIONS = [
  ['off', 'OFF'],
  ['digits', 'DIGITS'],
  ['flood', 'FULL'],
  ['gradient', 'GRADIENT'],
] as const;

/** one colour scheme, drawn in its own colours so it can be judged before it is picked */
function Swatch({ id, picked, onPick }: { id: SchemeId; picked: boolean; onPick(): void }) {
  const scheme = SCHEMES[id];
  return (
    <button
      aria-label={scheme.label}
      className="flex h-[50px] items-center justify-center gap-[6px]"
      style={{
        background: scheme.screen,
        boxShadow: picked ? `inset 0 0 0 3px ${scheme.fg}` : `inset 0 0 0 1px ${scheme.fg}55`,
      }}
      onClick={onPick}>
      <span className="h-7 w-[18px] rounded-[3px]" style={{ background: scheme.slower }} />
      <span className="h-7 w-[10px] rounded-[3px]" style={{ background: scheme.fg }} />
      <span className="h-7 w-[18px] rounded-[3px]" style={{ background: scheme.faster }} />
    </button>
  );
}

/** how the timer looks */
export function DisplayScreen({
  settings,
  update,
  onPage,
}: {
  settings: Settings;
  update(change: Partial<Settings>): void;
  onPage(page: OptionsPage): void;
}) {
  return (
    <div className="flex h-full flex-col gap-[14px] px-7 pt-4 pb-5">
      <Pages page="display" onPage={onPage} />
      <Field
        label={
          <>
            Colours <span className="text-off-white">{SCHEMES[settings.scheme].label}</span>
          </>
        }>
        <div className="grid grid-cols-6 gap-2">
          {(Object.keys(SCHEMES) as SchemeId[]).map(id => (
            <Swatch key={id} id={id} picked={id === settings.scheme} onPick={() => update({ scheme: id })} />
          ))}
        </div>
      </Field>
      <div className="flex gap-6">
        <Field className="flex-[3]" label="First screen">
          <Choice
            className="h-[52px]"
            options={LOOK_OPTIONS}
            value={settings.deltaLook}
            onPick={deltaLook => update({ deltaLook })}
          />
        </Field>
        <Field className="flex-[5]" label="Delta colour">
          {/* with the background moving, the screen-filling choices give way to the digits and come back with it off */}
          <Choice
            className="h-[52px]"
            options={STYLE_OPTIONS}
            value={deltaStyleInUse(settings)}
            unavailable={backdropInUse(settings) ? SCREEN_FILLING : []}
            onPick={deltaStyle => update({ deltaStyle })}
          />
        </Field>
      </div>
      <Field label="Background">
        <Choice
          className="h-[52px]"
          columns={5}
          options={[[PLAIN, 'PLAIN'], ...ANIMATIONS.map(({ id, label }) => [id, label.toUpperCase()] as const)]}
          value={backdropInUse(settings)?.id ?? PLAIN}
          onPick={backdrop => update({ backdrop })}
        />
      </Field>
    </div>
  );
}

/** shown in place of the timing screens while there is nothing to time */
export function Standby({ status, onDemo }: { status: Status; onDemo(): void }) {
  const offline = status === 'offline';
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-14 text-center">
      <div className="font-display text-screen-title font-medium tracking-display">
        {offline ? 'Waiting for the PC' : 'Waiting for a sim'}
      </div>
      <div className="max-w-[620px] text-[19px] leading-7 text-soft">
        {offline
          ? 'Plug the Car Thing into the sim PC over USB and open the bridgething desktop app there. The lap timer starts on its own once the two are linked.'
          : 'Linked to the PC. Start iRacing, Le Mans Ultimate, Automobilista 2 or RaceRoom and head out on track.'}
      </div>
      <button
        className="mt-3 h-14 border border-edge px-8 font-mono text-[17px] tracking-[0.1em] text-near active:bg-neutral-soft"
        onClick={event => {
          event.stopPropagation();
          onDemo();
        }}>
        SHOW DEMO LAPS
      </button>
    </div>
  );
}
