import type { Sample, SimDelta } from '../../src/shared/protocol.ts';
import { cstr } from '../layout.ts';
import type { Reader } from './types.ts';

export const IRACING_MAPPING = 'Local\\IRSDKMemMapFileName';

// irsdk_header
const STATUS = 4;
const SESSION_INFO_UPDATE = 12;
const SESSION_INFO_LEN = 16;
const SESSION_INFO_OFFSET = 20;
const NUM_VARS = 24;
const VAR_HEADER_OFFSET = 28;
const NUM_BUF = 32;
const VAR_BUF = 48;
const VAR_BUF_SIZE = 16;
const MAX_BUFS = 4;
const STATUS_CONNECTED = 1;

// irsdk_varHeader
const VAR_HEADER_SIZE = 144;
const VAR_TYPE = 0;
const VAR_OFFSET = 4;
const VAR_NAME = 16;
const VAR_NAME_LENGTH = 32;

const TYPE_BOOL = 1;
const TYPE_INT = 2;
const TYPE_BITFIELD = 3;
const TYPE_FLOAT = 4;
const TYPE_DOUBLE = 5;

const TRACK_SURFACE_NOT_IN_WORLD = -1;

const WANTED = [
  'SessionTime',
  'IsOnTrack',
  'IsReplayPlaying',
  'OnPitRoad',
  'PlayerTrackSurface',
  'LapDistPct',
  'LapCurrentLapTime',
  'LapLastLapTime',
  'LapBestLapTime',
  'Speed',
  'PlayerCarMyIncidentCount',
  'LapDeltaToBestLap',
  'LapDeltaToBestLap_DD',
  'LapDeltaToBestLap_OK',
  'LapDeltaToSessionBestLap',
  'LapDeltaToSessionBestLap_DD',
  'LapDeltaToSessionBestLap_OK',
  // the sim itself spells this one with the stray l
  'LapDeltaToSessionLastlLap',
  'LapDeltaToSessionLastlLap_DD',
  'LapDeltaToSessionLastlLap_OK',
] as const;

type VarName = (typeof WANTED)[number];

interface Var {
  type: number;
  offset: number;
}

function yamlValue(text: string, key: string): string {
  const match = new RegExp(`^\\s*${key}:[ \\t]*(.*)$`, 'm').exec(text);
  return match ? match[1]!.trim().replace(/^["']|["']$/g, '') : '';
}

/** the session string is yaml, and the few scalars wanted are easier to pick out than to parse */
export function parseSessionInfo(text: string): {
  track: string;
  trackId: string;
  trackLength: number;
  car: string;
  carId: string;
} {
  const name = yamlValue(text, 'TrackDisplayName') || yamlValue(text, 'TrackName');
  const config = yamlValue(text, 'TrackConfigName');
  const trackId = [yamlValue(text, 'TrackName'), config].filter(Boolean).join('/');
  const km = /([\d.]+)\s*km/.exec(yamlValue(text, 'TrackLength'));

  let car = '';
  let carId = '';
  const mine = yamlValue(text, 'DriverCarIdx');
  // session results list cars by index too, and come first, so look only below the driver heading
  const drivers = text.slice(Math.max(text.search(/^DriverInfo:/m), 0));
  for (const driver of drivers.split(/^\s*-\s*CarIdx:[ \t]*/m).slice(1)) {
    if (/^(\d+)/.exec(driver)?.[1] !== mine) continue;
    car = yamlValue(driver, 'CarScreenName');
    carId = yamlValue(driver, 'CarPath') || car;
    break;
  }

  return {
    track: config && config !== 'null' ? `${name} ${config}` : name,
    trackId: trackId || name,
    trackLength: km ? Number(km[1]) * 1000 : 0,
    car: car || carId,
    carId,
  };
}

export class IRacingReader implements Reader {
  private vars = new Map<VarName, Var>();
  private infoUpdate = -1;
  private info = { track: '', trackId: '', trackLength: 0, car: '', carId: '' };
  private tick = 0;
  private incidents: number | null = null;
  private incidentsRead = 0;

  constructor(private readonly view: DataView) {}

  pulse(): number {
    return this.latest()?.tick ?? this.tick;
  }

  poll(): Sample | null {
    const v = this.view;
    if ((v.getInt32(STATUS, true) & STATUS_CONNECTED) === 0) {
      this.vars.clear();
      this.infoUpdate = -1;
      return null;
    }
    if (this.vars.size === 0) this.readVarHeaders();
    const infoUpdate = v.getInt32(SESSION_INFO_UPDATE, true);
    if (infoUpdate !== this.infoUpdate) {
      this.infoUpdate = infoUpdate;
      this.info = parseSessionInfo(
        cstr(v, v.getInt32(SESSION_INFO_OFFSET, true), v.getInt32(SESSION_INFO_LEN, true), 'latin1'),
      );
    }

    // the sim rotates between buffers, so read the newest and go again if it was overwritten meanwhile
    for (let attempt = 0; attempt < 3; attempt++) {
      const buf = this.latest();
      if (!buf) return null;
      const sample = this.read(buf.offset);
      if (v.getInt32(buf.slot, true) === buf.tick) {
        this.tick = buf.tick;
        this.incidents = this.incidentsRead;
        return sample;
      }
    }
    return null;
  }

  private latest(): { slot: number; tick: number; offset: number } | null {
    const v = this.view;
    const count = Math.min(v.getInt32(NUM_BUF, true), MAX_BUFS);
    let best: { slot: number; tick: number; offset: number } | null = null;
    for (let i = 0; i < count; i++) {
      const slot = VAR_BUF + i * VAR_BUF_SIZE;
      const tick = v.getInt32(slot, true);
      if (!best || tick > best.tick) best = { slot, tick, offset: v.getInt32(slot + 4, true) };
    }
    return best;
  }

  private readVarHeaders(): void {
    const v = this.view;
    const count = v.getInt32(NUM_VARS, true);
    const base = v.getInt32(VAR_HEADER_OFFSET, true);
    const wanted = new Set<string>(WANTED);
    for (let i = 0; i < count; i++) {
      const at = base + i * VAR_HEADER_SIZE;
      const name = cstr(v, at + VAR_NAME, VAR_NAME_LENGTH, 'latin1');
      if (!wanted.has(name)) continue;
      this.vars.set(name as VarName, {
        type: v.getInt32(at + VAR_TYPE, true),
        offset: v.getInt32(at + VAR_OFFSET, true),
      });
    }
  }

  private value(row: number, name: VarName, fallback: number): number {
    const found = this.vars.get(name);
    if (!found) return fallback;
    const at = row + found.offset;
    switch (found.type) {
      case TYPE_BOOL:
        return this.view.getUint8(at);
      case TYPE_INT:
      case TYPE_BITFIELD:
        return this.view.getInt32(at, true);
      case TYPE_FLOAT:
        return this.view.getFloat32(at, true);
      case TYPE_DOUBLE:
        return this.view.getFloat64(at, true);
      default:
        return fallback;
    }
  }

  private read(row: number): Sample {
    const lapDist = this.value(row, 'LapDistPct', -1);
    const inWorld = this.value(row, 'PlayerTrackSurface', 0) !== TRACK_SURFACE_NOT_IN_WORLD;
    const lastLapTime = this.value(row, 'LapLastLapTime', -1);
    const bestLapTime = this.value(row, 'LapBestLapTime', -1);
    this.incidentsRead = this.value(row, 'PlayerCarMyIncidentCount', 0);
    return {
      sim: 'iRacing',
      ...this.info,
      sessionTime: this.value(row, 'SessionTime', 0),
      live:
        this.value(row, 'IsOnTrack', 0) !== 0 && this.value(row, 'IsReplayPlaying', 0) === 0 && inWorld && lapDist >= 0,
      inPit: this.value(row, 'OnPitRoad', 0) !== 0,
      lapDist: Math.min(Math.max(lapDist, 0), 1),
      lapTime: this.value(row, 'LapCurrentLapTime', -1),
      lastLapTime,
      speed: this.value(row, 'Speed', 0),
      // the sim does not count a lap with an incident on it as a best lap
      lapValid: this.incidents === null || this.incidentsRead <= this.incidents,
      simDelta: this.vars.has('LapDeltaToSessionBestLap')
        ? {
            best: this.delta(row, 'LapDeltaToBestLap', null),
            session: this.delta(row, 'LapDeltaToSessionBestLap', bestLapTime > 0 ? bestLapTime : null),
            last: this.delta(row, 'LapDeltaToSessionLastlLap', lastLapTime > 0 ? lastLapTime : null),
          }
        : undefined,
    };
  }

  private delta(
    row: number,
    name: 'LapDeltaToBestLap' | 'LapDeltaToSessionBestLap' | 'LapDeltaToSessionLastlLap',
    refTime: number | null,
  ): SimDelta {
    const ok = this.value(row, `${name}_OK`, 0) !== 0;
    return { delta: ok ? this.value(row, name, 0) : null, rate: this.value(row, `${name}_DD`, 0), refTime };
  }
}
