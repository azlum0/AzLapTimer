import { BINS, type Reference } from './engine.ts';

/** how a reference lap is kept in a json store */
export interface StoredReference {
  lapTime: number;
  date: number;
  times: string;
  speeds: string;
}

function toBase64(values: Float32Array): string {
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Float32Array | null {
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    return null;
  }
  if (binary.length !== (BINS + 1) * 4) return null;
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

export function encodeReference(reference: Reference): StoredReference {
  return {
    lapTime: reference.lapTime,
    date: reference.date,
    times: toBase64(reference.times),
    speeds: toBase64(reference.speeds),
  };
}

export function decodeReference(stored: unknown): Reference | null {
  if (typeof stored !== 'object' || stored === null) return null;
  const { lapTime, date, times, speeds } = stored as Partial<StoredReference>;
  if (typeof lapTime !== 'number' || !(lapTime > 0) || typeof times !== 'string' || typeof speeds !== 'string') {
    return null;
  }
  const t = fromBase64(times);
  const v = fromBase64(speeds);
  if (!t || !v) return null;
  return { lapTime, date: typeof date === 'number' ? date : 0, times: t, speeds: v };
}
