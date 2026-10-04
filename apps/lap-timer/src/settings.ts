import type { BridgethingClient } from '@bridgething/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Units } from './format';

export interface Scheme {
  label: string;
  screen: string;
  fg: string;
  faster: string;
  slower: string;
  ledOff: string;
}

export const SCHEMES = {
  classic: {
    label: 'Classic',
    screen: '#060809',
    fg: '#efefef',
    faster: '#2fe36d',
    slower: '#ff4136',
    ledOff: '#17191b',
  },
  // blue against orange stays apart for red-green colour blindness
  contrast: {
    label: 'Blue / Orange',
    screen: '#05070a',
    fg: '#f2f2f2',
    faster: '#3aa0ff',
    slower: '#ff9f1a',
    ledOff: '#161a1f',
  },
  amber: { label: 'Amber', screen: '#080602', fg: '#ffb629', faster: '#9be564', slower: '#ff5a36', ledOff: '#1c1608' },
  ice: { label: 'Ice', screen: '#040912', fg: '#dff3ff', faster: '#29e0ff', slower: '#ff4fa3', ledOff: '#101a28' },
  night: { label: 'Night', screen: '#000000', fg: '#8a8a8a', faster: '#1f9c4b', slower: '#b32d25', ledOff: '#0e0e0e' },
  light: { label: 'Light', screen: '#f3f3ee', fg: '#101214', faster: '#0a8f3c', slower: '#d21f14', ledOff: '#dadad3' },
} as const satisfies Record<string, Scheme>;

export type SchemeId = keyof typeof SCHEMES;
export type DeltaStyle = 'digits' | 'flood';

export const LED_STEPS = [1, 2, 5] as const;
export const FLASH_SECONDS = [3, 6, 10] as const;

export interface Settings {
  units: Units;
  scheme: SchemeId;
  /** colour the delta digits, or flood the whole screen with the colour */
  deltaStyle: DeltaStyle;
  /** speed difference each led stands for, in the chosen unit */
  ledStep: (typeof LED_STEPS)[number];
  /** how long a finished lap stays on screen */
  flashSeconds: (typeof FLASH_SECONDS)[number];
}

export const DEFAULTS: Settings = {
  units: 'kmh',
  scheme: 'classic',
  deltaStyle: 'digits',
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
    deltaStyle: oneOf(raw.deltaStyle, ['digits', 'flood'] as const, DEFAULTS.deltaStyle),
    ledStep: oneOf(raw.ledStep, LED_STEPS, DEFAULTS.ledStep),
    flashSeconds: oneOf(raw.flashSeconds, FLASH_SECONDS, DEFAULTS.flashSeconds),
  };
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
  const scheme = SCHEMES[id];
  const root = document.documentElement.style;
  root.setProperty('--color-screen', scheme.screen);
  root.setProperty('--color-bg', scheme.screen);
  root.setProperty('--color-fg', scheme.fg);
  root.setProperty('--color-off-white', scheme.fg);
  root.setProperty('--color-faster', scheme.faster);
  root.setProperty('--color-slower', scheme.slower);
  root.setProperty('--color-led-off', scheme.ledOff);
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
