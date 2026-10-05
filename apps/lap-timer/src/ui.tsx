import type { ReactNode } from 'react';

const WIDE = /[0-9+−-]/;

/** every digit gets the same width, so a number that changes thirty times a second does not shake */
export function Digits({ text, size, className = '' }: { text: string; size: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-baseline font-display leading-none font-semibold ${className}`}
      style={{ fontSize: size }}>
      {Array.from(text, (char, i) => (
        <span key={i} className="inline-block text-center" style={{ width: WIDE.test(char) ? '0.62em' : '0.28em' }}>
          {char}
        </span>
      ))}
    </span>
  );
}

export function Label({
  children,
  className = '',
  bright = false,
  size = 16,
}: {
  children: ReactNode;
  className?: string;
  /** full text colour, for when the label sits on a coloured background */
  bright?: boolean;
  size?: number;
}) {
  return (
    <div
      className={`font-mono leading-5 tracking-[0.16em] uppercase ${bright ? 'text-off-white' : 'text-soft'} ${className}`}
      style={{ fontSize: size }}>
      {children}
    </div>
  );
}

const LEDS_PER_SIDE = 10;

/**
 * The strip across the top of the unit: green builds to the right when carrying more speed than
 * the reference did here, red builds to the left when carrying less. `plain` lights it in the
 * text colour, for when the whole screen is already flooded with the delta colour.
 */
export function LedBar({ value, perLed, plain = false }: { value: number | null; perLed: number; plain?: boolean }) {
  const lit = value === null ? 0 : Math.min(LEDS_PER_SIDE, Math.round(Math.abs(value) / perLed));
  const slower = value !== null && value < 0;
  const on = (colour: 'faster' | 'slower') =>
    plain
      ? 'bg-off-white'
      : colour === 'faster'
        ? 'bg-faster shadow-[0_0_14px_var(--color-faster)]'
        : 'bg-slower shadow-[0_0_14px_var(--color-slower)]';
  const side = (count: number, colour: string, fromCentre: (i: number) => number) =>
    Array.from({ length: LEDS_PER_SIDE }, (_, i) => (
      <div key={i} className={`h-full flex-1 rounded-[3px] ${fromCentre(i) < count ? colour : 'bg-led-off'}`} />
    ));
  return (
    <div className="flex h-9 w-full items-stretch gap-[5px]">
      {side(slower ? lit : 0, on('slower'), i => LEDS_PER_SIDE - 1 - i)}
      <div className="mx-[3px] w-[3px] self-stretch bg-edge" />
      {side(slower ? 0 : lit, on('faster'), i => i)}
    </div>
  );
}

export function Cell({
  label,
  children,
  className = '',
  bright = false,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  bright?: boolean;
}) {
  return (
    <div className={`flex flex-1 flex-col gap-2 ${className}`}>
      <Label bright={bright}>{label}</Label>
      {children}
    </div>
  );
}

const BUTTON = 'border font-mono text-[17px] tracking-[0.1em] transition';
const PICKED = 'border-off-white bg-off-white text-screen';
const UNPICKED = 'border-edge text-near active:bg-neutral-soft';

export function Choice<T extends string | number>({
  options,
  value,
  onPick,
  className = 'h-14',
  unavailable = [],
  columns,
}: {
  options: readonly (readonly [value: T, label: string])[];
  value: T;
  onPick(value: T): void;
  className?: string;
  /** options shown faded and not pickable, because another setting is overriding them for now */
  unavailable?: readonly T[];
  /** lay the options out this many to a row, wrapping onto more rows, instead of all in one */
  columns?: number;
}) {
  return (
    <div
      className={columns ? 'grid gap-2' : 'flex gap-2'}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}>
      {options.map(([option, label]) => (
        <button
          key={option}
          disabled={unavailable.includes(option)}
          className={`flex-1 ${className} ${BUTTON} ${option === value ? PICKED : UNPICKED} disabled:opacity-30`}
          onClick={() => onPick(option)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Button({
  children,
  onClick,
  className = '',
  warn = false,
}: {
  children: ReactNode;
  onClick(): void;
  className?: string;
  warn?: boolean;
}) {
  return (
    <button
      className={`${BUTTON} ${className} ${warn ? 'border-warn bg-warn-soft text-warn' : UNPICKED}`}
      onClick={onClick}>
      {children}
    </button>
  );
}

/** a labelled group on an options page */
export function Field({
  label,
  children,
  className = '',
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
