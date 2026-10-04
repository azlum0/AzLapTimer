import type { Sample } from '../../src/shared/protocol.ts';
import { cstr, struct } from '../layout.ts';
import type { Log, Reader } from './types.ts';

export const R3E_MAPPING = '$R3E';

// field order follows r3e.h from github.com/sector3studios/r3e-api, version 3.5. the whole
// struct is packed to 1 byte.
const PACK = 1;
const TIRES = 4;

const playerData = struct(
  [
    ['_userId', 'i32'],
    ['simulationTicks', 'i32'],
    ['simulationTime', 'f64'],
    ['_position_to_localGForce', 'f64', 33],
    ['_steeringForce_to_torqueMguK', 'f64', 9],
    ['_suspensionDeflection_to_rideHeight', 'f64', 4 * TIRES],
    ['_frontWingHeight_to_thirdSpringSuspensionVelocityRear', 'f64', 7],
    ['_unused', 'f64', 3],
  ],
  PACK,
);

const flags = struct([['_yellow_to_blackAndWhite', 'i32', 14]], PACK);
const cutTrackPenalties = struct([['_driveThrough_to_slowDown', 'f32', 5]], PACK);

const driverInfo = struct(
  [
    ['_name', 'u8', 64],
    ['_carNumber_classId', 'i32', 2],
    ['modelId', 'i32'],
    ['_teamId_to_engineType', 'i32', 7],
    ['_carWidth_to_unused2', 'f32', 6],
  ],
  PACK,
);

const driverData = struct(
  [
    ['_driverInfo', driverInfo],
    ['_finishStatus_place_placeClass', 'i32', 3],
    ['_lapDistance_lapDistanceFraction', 'f32', 2],
    ['_position', 'f32', 3],
    ['_trackSector_completedLaps_currentLapValid', 'i32', 3],
    ['_lapTimeCurrentSelf', 'f32'],
    ['_sectorTimes', 'f32', 9],
    ['_timeDeltaFront_timeDeltaBehind', 'f32', 2],
    ['_pitstopStatus_inPitlane_numPitstops', 'i32', 3],
    ['_penalties', cutTrackPenalties],
    ['_carSpeed', 'f32'],
    ['_tireTypeFront_to_tireSubtypeRear', 'i32', 4],
    ['_basePenaltyWeight_aidPenaltyWeight', 'f32', 2],
    ['_drsState_ptpState', 'i32', 2],
    ['_virtualEnergy', 'f32'],
    ['_penaltyType_penaltyReason_engineState', 'i32', 3],
    ['_orientation', 'f32', 3],
    ['_unused', 'f32', 3],
  ],
  PACK,
);

export const r3eLayout = struct(
  [
    ['versionMajor', 'i32'],
    ['_versionMinor', 'i32'],
    ['allDriversOffset', 'i32'],
    ['driverDataSize', 'i32'],
    ['_gameMode', 'i32'],
    ['gamePaused', 'i32'],
    ['gameInMenus', 'i32'],
    ['gameInReplay', 'i32'],
    ['_gameUsingVr_gamePlayerInGarage', 'i32', 2],
    ['player', playerData],
    ['trackName', 'u8', 64],
    ['layoutName', 'u8', 64],
    ['_trackId', 'i32'],
    ['layoutId', 'i32'],
    ['layoutLength', 'f32'],
    ['_sectorStartFactors', 'f32', 3],
    ['_raceSessionLaps_raceSessionMinutes', 'i32', 6],
    ['_eventIndex_to_sessionLengthFormat', 'i32', 4],
    ['_sessionPitSpeedLimit', 'f32'],
    ['_sessionPhase_to_numberOfLaps', 'i32', 5],
    ['_sessionTimeDuration_sessionTimeRemaining', 'f32', 2],
    ['_maxIncidentPoints', 'i32'],
    ['_eventUnused', 'f32', 2],
    ['_pitWindowStatus_to_pitWindowEnd', 'i32', 3],
    ['inPitlane', 'i32'],
    ['_pitMenuSelection', 'i32'],
    ['_pitMenuState', 'i32', 12],
    ['_pitState', 'i32'],
    ['_pitTotalDuration_pitElapsedTime', 'f32', 2],
    ['_pitAction_numPitstops', 'i32', 2],
    ['_pitMinDurationTotal_pitMinDurationLeft', 'f32', 2],
    ['_flags', flags],
    ['_position_to_cutTrackWarnings', 'i32', 4],
    ['_penalties', cutTrackPenalties],
    ['_numPenalties_completedLaps', 'i32', 2],
    ['currentLapValid', 'i32'],
    ['_trackSector', 'i32'],
    ['_lapDistance', 'f32'],
    ['lapDistanceFraction', 'f32'],
    ['_lapTimeBestLeader_to_sectorTimeBestSelf', 'f32', 9],
    ['lapTimePreviousSelf', 'f32'],
    ['_sectorTimePreviousSelf', 'f32', 3],
    ['lapTimeCurrentSelf', 'f32'],
    ['_sectorTimeCurrentSelf', 'f32', 3],
    ['_lapTimeDeltaLeader_to_timeDeltaBestSelf', 'f32', 5],
    ['_bestIndividualSectorTimes', 'f32', 9],
    ['_incidentPoints_lapValidState_prevLapValid', 'i32', 3],
    ['_dischargeRate_brakeRegen_unused1', 'f32', 3],
    ['vehicleInfo', driverInfo],
    ['_playerName', 'u8', 64],
    ['controlType', 'i32'],
    ['carSpeed', 'f32'],
    ['_engineRps_maxEngineRps_upshiftRps', 'f32', 3],
    ['_gear_numGears', 'i32', 2],
    ['_carCgLocation_carOrientation_localAcceleration', 'f32', 9],
    ['_totalMass_to_steerInputRaw', 'f32', 19],
    ['_steerLockDegrees_steerWheelRangeDegrees', 'i32', 2],
    ['_aidSettings', 'i32', 5],
    ['_drs', 'i32', 4],
    ['_pitLimiter', 'i32'],
    ['_pushToPass', 'i32', 5],
    ['_brakeBias', 'f32'],
    ['_drsNumActivationsTotal_ptpNumActivationsTotal', 'i32', 2],
    ['_batterySoc_waterLeft', 'f32', 2],
    ['_absSetting_to_tireType', 'i32', 4],
    ['_tireRps_to_tireDirt', 'f32', 7 * TIRES],
    ['_tireTemp', 'f32', 6 * TIRES],
    ['_tireTypeFront_to_tireSubtypeRear', 'i32', 4],
    ['_brakeTemp', 'f32', 4 * TIRES],
    ['_brakePressure', 'f32', TIRES],
    ['_tractionControlSetting_to_engineBrakeSetting', 'i32', 3],
    ['_tractionControlPercent', 'f32'],
    ['_tireOnMtrl', 'i32', TIRES],
    ['_tireLoad', 'f32', TIRES],
    ['_carDamage', 'f32', 6],
    ['_numCars', 'i32'],
    ['allDrivers', 'u8', 0],
  ],
  PACK,
);

export const r3eStructs = { playerData, driverInfo, driverData };

const at = r3eLayout.at;

const VERSION_MAJOR = 3;
const CONTROL_PLAYER = 0;

export class R3eReader implements Reader {
  constructor(private readonly view: DataView) {}

  /** the game says where its driver array starts and how big each entry is, which checks every offset before it */
  static create(view: DataView, log: Log): R3eReader | null {
    if (view.byteLength < r3eLayout.size) return null;
    const major = view.getInt32(at.versionMajor!, true);
    // all zero until the game has written its first frame
    if (major === 0) return null;
    const offset = view.getInt32(at.allDriversOffset!, true);
    const size = view.getInt32(at.driverDataSize!, true);
    if (major !== VERSION_MAJOR || offset !== at.allDrivers! || size !== driverData.size) {
      log(
        `RaceRoom shared memory is version ${major} with drivers at ${offset} (${size} bytes each), ` +
          `expected version ${VERSION_MAJOR} with drivers at ${at.allDrivers} (${driverData.size} bytes each); skipping it`,
      );
      return null;
    }
    return new R3eReader(view);
  }

  pulse(): number {
    return this.view.getInt32(at.player! + playerData.at.simulationTicks!, true);
  }

  poll(): Sample | null {
    const v = this.view;
    const trackLength = v.getFloat32(at.layoutLength!, true);
    const lapDist = v.getFloat32(at.lapDistanceFraction!, true);
    if (!(trackLength > 0)) return null;

    const track = cstr(v, at.trackName!, 64);
    const layout = cstr(v, at.layoutName!, 64);
    const model = v.getInt32(at.vehicleInfo! + driverInfo.at.modelId!, true);
    return {
      sim: 'RaceRoom',
      track: layout ? `${track} ${layout}` : track,
      trackId: String(v.getInt32(at.layoutId!, true)),
      car: `Car ${model}`,
      carId: String(model),
      trackLength,
      sessionTime: v.getFloat64(at.player! + playerData.at.simulationTime!, true),
      live:
        v.getInt32(at.gamePaused!, true) === 0 &&
        v.getInt32(at.gameInMenus!, true) === 0 &&
        v.getInt32(at.gameInReplay!, true) === 0 &&
        v.getInt32(at.controlType!, true) === CONTROL_PLAYER &&
        lapDist >= 0,
      inPit: v.getInt32(at.inPitlane!, true) === 1,
      lapDist: Math.min(Math.max(lapDist, 0), 1),
      lapTime: v.getFloat32(at.lapTimeCurrentSelf!, true),
      lastLapTime: v.getFloat32(at.lapTimePreviousSelf!, true),
      speed: v.getFloat32(at.carSpeed!, true),
      lapValid: v.getInt32(at.currentLapValid!, true) !== 0,
    };
  }
}
