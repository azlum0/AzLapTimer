import type { BridgethingClient } from '@bridgething/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ANIMATIONS, type Animation } from './animations';
import type { Units } from './format';

export interface Scheme {
  label: string;
  screen: string;
  fg: string;
  faster: string;
  slower: string;
  ledOff: string;
}

const scheme = (label: string, screen: string, fg: string, faster: string, slower: string, ledOff: string): Scheme => ({
  label,
  screen,
  fg,
  faster,
  slower,
  ledOff,
});

export const SCHEMES = {
  classic: scheme('Classic', '#060809', '#efefef', '#2fe36d', '#ff4136', '#17191b'),
  // blue against orange stays apart for red-green colour blindness
  contrast: scheme('Blue / Orange', '#05070a', '#f2f2f2', '#3aa0ff', '#ff9f1a', '#161a1f'),
  timing: scheme('Purple / Yellow', '#07060a', '#f2f2f2', '#c45cff', '#ffd60a', '#19161f'),
  neon: scheme('Neon', '#07060b', '#ffffff', '#b6ff00', '#ff2d95', '#18161f'),
  ice: scheme('Ice', '#040912', '#dff3ff', '#29e0ff', '#ff4fa3', '#101a28'),
  gulf: scheme('Gulf', '#06121f', '#e9f4ff', '#6fc8ff', '#ff7a1a', '#102338'),
  amber: scheme('Amber', '#080602', '#ffb629', '#9be564', '#ff5a36', '#1c1608'),
  phosphor: scheme('Phosphor', '#010501', '#45ff7a', '#d9ff5c', '#ff6a3d', '#08190c'),
  cockpit: scheme('Cockpit red', '#050000', '#ff5148', '#49d17a', '#ffb02e', '#1c0605'),
  blueprint: scheme('Blueprint', '#07205a', '#ffffff', '#7dff8a', '#ffb347', '#12327a'),
  night: scheme('Night', '#000000', '#8a8a8a', '#1f9c4b', '#b32d25', '#0e0e0e'),
  light: scheme('Light', '#f3f3ee', '#101214', '#0a8f3c', '#d21f14', '#dadad3'),
} as const satisfies Record<string, Scheme>;

export type SchemeId = keyof typeof SCHEMES;
/**
 * Where the delta's colour goes: nowhere, onto the digits, across the whole screen in one colour
 * or the other, or across the whole screen as a blend between the two.
 */
export type DeltaStyle = 'off' | 'digits' | 'flood' | 'gradient';
export const SCREEN_FILLING: readonly DeltaStyle[] = ['flood', 'gradient'];
/** the first screen as designed for this display, or drawn the way a Racelogic VBOX LapTimer draws it */
export type DeltaLook = 'standard' | 'racelogic';

/** no background, for the backdrop setting */
export const PLAIN = 'off';

export const LED_STEPS = [1, 2, 5] as const;
export const FLASH_SECONDS = [3, 6, 10] as const;

export interface Settings {
  units: Units;
  scheme: SchemeId;
  deltaLook: DeltaLook;
  deltaStyle: DeltaStyle;
  /** `PLAIN`, or the id of the animation to run behind the timing screens */
  backdrop: string;
  /** speed difference each led stands for, in the chosen unit */
  ledStep: (typeof LED_STEPS)[number];
  /** how long a finished lap stays on screen */
  flashSeconds: (typeof FLASH_SECONDS)[number];
}

export const DEFAULTS: Settings = {
  units: 'kmh',
  scheme: 'classic',
  deltaLook: 'standard',
  deltaStyle: 'digits',
  backdrop: PLAIN,
  ledStep: 1,
  flashSeconds: 6,
};

const KEY = 'settings';
const LOCAL_KEY = 'lap-timer.settings';

/** anything missing or unrecognised falls back to its default, so an older save still loads */
export function parseSettings(text: string | null | undefined): Settings {
  let raw: Partial<Record<keyof Settings, unknown>> = {};
  try {
    const parsed: unknown = text ? JSON.parse(text) : null;
    if (typeof parsed === 'object' && parsed !== null) raw = parsed;
  } catch {
    // start from the defaults
  }
  const oneOf = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback;
  return {
    units: oneOf(raw.units, ['kmh', 'mph'] as const, DEFAULTS.units),
    scheme: oneOf(raw.scheme, Object.keys(SCHEMES) as SchemeId[], DEFAULTS.scheme),
    deltaLook: oneOf(raw.deltaLook, ['standard', 'racelogic'] as const, DEFAULTS.deltaLook),
    deltaStyle: oneOf(raw.deltaStyle, ['off', 'digits', 'flood', 'gradient'] as const, DEFAULTS.deltaStyle),
    // before there was more than one animation the setting was just on or off
    backdrop: raw.backdrop === 'animated' ? 'streaks' : typeof raw.backdrop === 'string' ? raw.backdrop : PLAIN,
    ledStep: oneOf(raw.ledStep, LED_STEPS, DEFAULTS.ledStep),
    flashSeconds: oneOf(raw.flashSeconds, FLASH_SECONDS, DEFAULTS.flashSeconds),
  };
}

/** the animation the setting names, or null for a plain background or one that is no longer in the app */
export function backdropInUse(settings: Settings): Animation | null {
  return ANIMATIONS.find(animation => animation.id === settings.backdrop) ?? null;
}

/** a colour that fills the screen would hide a moving background, so with one running the digits carry it */
export function deltaStyleInUse(settings: Settings): DeltaStyle {
  return backdropInUse(settings) && SCREEN_FILLING.includes(settings.deltaStyle) ? 'digits' : settings.deltaStyle;
}

function readLocal(): Settings {
  try {
    return parseSettings(localStorage.getItem(LOCAL_KEY));
  } catch {
    return DEFAULTS;
  }
}

/** every other colour in the theme is mixed from these, so setting them on the root recolours the lot */
export function applyScheme(id: SchemeId): void {
  const picked = SCHEMES[id];
  const root = document.documentElement.style;
  root.setProperty('--color-screen', picked.screen);
  root.setProperty('--color-bg', picked.screen);
  root.setProperty('--color-fg', picked.fg);
  root.setProperty('--color-off-white', picked.fg);
  root.setProperty('--color-faster', picked.faster);
  root.setProperty('--color-slower', picked.slower);
  root.setProperty('--color-led-off', picked.ledOff);
}

/**
 * The display choices, kept in the Car Thing's own store so they survive a restart. The browser's
 * storage stands in when the page is open with no Car Thing behind it.
 */
export function useSettings(client: BridgethingClient | null): [Settings, (change: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(readLocal);
  const latest = useRef(settings);
  latest.current = settings;

  useEffect(() => {
    if (!client) return;
    let stale = false;
    const load = () =>
      void client.store
        .get({ key: KEY })
        .then(result => {
          if (!stale && result.ok && result.response.value) setSettings(parseSettings(result.response.value));
        })
        .catch(() => {});
    if (client.connectionState === 'open') load();
    const off = client.on(event => {
      if (event.type === 'open') load();
    });
    return () => {
      stale = true;
      off();
    };
  }, [client]);

  useEffect(() => applyScheme(settings.scheme), [settings.scheme]);

  const update = useCallback(
    (change: Partial<Settings>) => {
      const next = { ...latest.current, ...change };
      latest.current = next;
      setSettings(next);
      const text = JSON.stringify(next);
      try {
        localStorage.setItem(LOCAL_KEY, text);
      } catch {
        // the store on the device below is the one that matters
      }
      if (client?.connectionState === 'open') void client.store.put({ key: KEY, value: text }).catch(() => {});
    },
    [client],
  );

  return [settings, update];
}
