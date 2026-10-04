import type { Sample } from '../../src/shared/protocol.ts';
import { cstr, struct } from '../layout.ts';
import type { Log, Reader } from './types.ts';

export const AMS2_MAPPING = '$pcars2$';

// field order follows SharedMemory.h in the game's Support/SharedMemory folder, down to the
// sequence number. everything after it is left alone.
const STRING = 64;
const PARTICIPANTS = 64;

const participant = struct([
  ['_isActive', 'bool'],
  ['_name', 'u8', STRING],
  ['_worldPosition', 'f32', 3],
  ['currentLapDistance', 'f32'],
  ['_racePosition_lapsCompleted_currentLap', 'u32', 3],
  ['_currentSector', 'i32'],
]);

export const ams2Layout = struct([
  ['version', 'u32'],
  ['_buildVersionNumber', 'u32'],
  ['gameState', 'u32'],
  ['_sessionState_raceState', 'u32', 2],
  ['viewedParticipantIndex', 'i32'],
  ['numParticipants', 'i32'],
  ['participants', participant, PARTICIPANTS],
  ['_unfilteredThrottle_to_unfilteredClutch', 'f32', 4],
  ['carName', 'u8', STRING],
  ['_carClassName', 'u8', STRING],
  ['_lapsInEvent', 'u32'],
  ['trackLocation', 'u8', STRING],
  ['trackVariation', 'u8', STRING],
  ['trackLength', 'f32'],
  ['_numSectors', 'i32'],
  ['lapInvalidated', 'bool'],
  ['_bestLapTime', 'f32'],
  ['lastLapTime', 'f32'],
  ['currentTime', 'f32'],
  ['_splitTimeAhead_to_worldFastestSector3Time', 'f32', 18],
  ['_highestFlagColour_highestFlagReason', 'u32', 2],
  ['pitMode', 'u32'],
  ['_pitSchedule_carFlags', 'u32', 2],
  ['_oilTempCelsius_to_fuelCapacity', 'f32', 7],
  ['speed', 'f32'],
  ['_rpm_to_steering', 'f32', 6],
  ['_gear_numGears', 'i32', 2],
  ['_odometerKM', 'f32'],
  ['_antiLockActive', 'bool'],
  ['_lastOpponentCollisionIndex', 'i32'],
  ['_lastOpponentCollisionMagnitude', 'f32'],
  ['_boostActive', 'bool'],
  ['_boostAmount', 'f32'],
  ['_orientation_to_extentsCentre', 'f32', 21],
  ['_tyreFlags_to_tyreInternalAirTemp', 'u32', 72],
  ['_crashState', 'u32'],
  ['_aeroDamage_engineDamage', 'f32', 2],
  ['_ambientTemperature_to_cloudBrightness', 'f32', 7],
  ['sequenceNumber', 'u32'],
]);

const at = ams2Layout.at;

const GAME_INGAME_PLAYING = 2;
const PIT_MODE_NONE = 0;
const OLDEST_VERSION = 5;
const NEWEST_PLAUSIBLE_VERSION = 100;

export class Ams2Reader implements Reader {
  private clock = 0;
  private lastPollAt: number | null = null;

  constructor(
    private readonly view: DataView,
    private readonly now: () => number = () => performance.now() / 1000,
  ) {}

  static create(view: DataView, log: Log): Ams2Reader | null {
    const version = view.byteLength >= ams2Layout.size ? view.getUint32(at.version!, true) : -1;
    if (version < OLDEST_VERSION || version > NEWEST_PLAUSIBLE_VERSION) {
      log(`Automobilista 2 shared memory reports version ${version}, which this reader does not know; skipping it`);
      return null;
    }
    return new Ams2Reader(view);
  }

  pulse(): number {
    return this.view.getUint32(at.sequenceNumber!, true);
  }

  poll(): Sample | null {
    const v = this.view;
    // odd while the game is part way through writing
    for (let attempt = 0; attempt < 3; attempt++) {
      const sequence = v.getUint32(at.sequenceNumber!, true);
      if (sequence % 2 === 1) continue;
      const sample = this.read();
      if (v.getUint32(at.sequenceNumber!, true) === sequence) return sample;
    }
    return null;
  }

  private read(): Sample | null {
    const v = this.view;
    const viewed = v.getInt32(at.viewedParticipantIndex!, true);
    const trackLength = v.getFloat32(at.trackLength!, true);
    if (viewed < 0 || viewed >= PARTICIPANTS || viewed >= v.getInt32(at.numParticipants!, true) || !(trackLength > 0)) {
      this.lastPollAt = null;
      return null;
    }

    const live = v.getUint32(at.gameState!, true) === GAME_INGAME_PLAYING;
    // the game publishes no session clock, so run one that stops whenever the game does
    const now = this.now();
    if (live && this.lastPollAt !== null) this.clock += Math.min(now - this.lastPollAt, 0.25);
    this.lastPollAt = live ? now : null;

    const location = cstr(v, at.trackLocation!, STRING);
    const variation = cstr(v, at.trackVariation!, STRING);
    const car = cstr(v, at.carName!, STRING);
    const metres = v.getFloat32(
      at.participants! + viewed * participant.size + participant.at.currentLapDistance!,
      true,
    );
    return {
      sim: 'Automobilista 2',
      track: variation ? `${location} ${variation}` : location,
      trackId: `${location}/${variation}`,
      car,
      carId: car,
      trackLength,
      sessionTime: this.clock,
      live,
      inPit: v.getUint32(at.pitMode!, true) !== PIT_MODE_NONE,
      lapDist: Math.min(Math.max(metres / trackLength, 0), 1),
      lapTime: v.getFloat32(at.currentTime!, true),
      lastLapTime: v.getFloat32(at.lastLapTime!, true),
      speed: v.getFloat32(at.speed!, true),
      lapValid: v.getUint8(at.lapInvalidated!) === 0,
    };
  }
}
