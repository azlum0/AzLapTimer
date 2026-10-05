export type Units = 'kmh' | 'mph';

const MINUS = '−';

/** 92.3456 -> "1:32.346". the minutes stay even at zero, so the digits never shift sideways. */
export function lapTime(seconds: number | null | undefined, places = 3): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return places === 3 ? '-:--.---' : '-:--.-';
  }
  const scale = 10 ** places;
  const total = Math.round(seconds * scale) / scale;
  const minutes = Math.floor(total / 60);
  return `${minutes}:${(total - minutes * 60).toFixed(places).padStart(places + 3, '0')}`;
}

/** -0.4239 -> "−0.42" */
export function delta(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '';
  const size = Math.abs(seconds);
  const text = size >= 100 ? size.toFixed(0) : size >= 10 ? size.toFixed(1) : size.toFixed(2);
  return `${seconds < 0 ? MINUS : '+'}${text}`;
}

export function speed(metresPerSecond: number, units: Units): number {
  return metresPerSecond * (units === 'mph' ? 2.2369363 : 3.6);
}

export const unitLabel = (units: Units): string => (units === 'mph' ? 'MPH' : 'KM/H');

/** a hundredth either way reads as level */
export function tone(seconds: number | null | undefined): 'faster' | 'slower' | 'level' {
  if (seconds === null || seconds === undefined || Math.abs(seconds) < 0.005) return 'level';
  return seconds < 0 ? 'faster' : 'slower';
}

/** a delta the way a racelogic unit writes it: sign, two digits of seconds, hundredths */
export function rlDelta(seconds: number): string {
  const size = Math.min(Math.abs(seconds), 99.99);
  return `${seconds < 0 ? MINUS : '+'}${size.toFixed(2).padStart(5, '0')}`;
}

/** a lap time the way a racelogic unit writes it: 2'08.40 */
export function rlLapTime(seconds: number | null | undefined, places = 2): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return places === 2 ? "-'--.--" : "-'--.-";
  }
  const scale = 10 ** places;
  const total = Math.round(seconds * scale) / scale;
  const minutes = Math.floor(total / 60);
  return `${minutes}'${(total - minutes * 60).toFixed(places).padStart(places + 3, '0')}`;
}
