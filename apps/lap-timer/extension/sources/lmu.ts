import type { Sample } from '../../src/shared/protocol.ts';
import { cstr, struct, type Layout } from '../layout.ts';
import type { Log, Reader } from './types.ts';

export const LMU_MAPPING = 'LMU_Data';

// field order follows InternalsPlugin.hpp and SharedMemoryInterface.hpp in the game's
// Support/SharedMemoryInterface folder. the plugin structs are packed to 4 bytes, the wrappers are not.
const PLUGIN_PACK = 4;
const MAX_VEHICLES = 104;
const MAX_PATH = 260;
const EVENT_COUNT = 16;

const vec3 = struct([['_xyz', 'f64', 3]], PLUGIN_PACK);

const wheel = struct(
  [
    ['_suspensionDeflection_to_pressure', 'f64', 16],
    ['_temperature', 'f64', 3],
    ['_wear', 'f64'],
    ['_terrainName', 'u8', 16],
    ['_surfaceType_to_staticUndeflectedRadius', 'u8', 4],
    ['_verticalTireDeflection_to_tireCarcassTemperature', 'f64', 4],
    ['_tireInnerLayerTemperature', 'f64', 3],
    ['_optimalTemp', 'f32'],
    ['_compoundIndex_compoundType', 'u8', 2],
    ['_expansion', 'u8', 18],
  ],
  PLUGIN_PACK,
);

const telem = struct(
  [
    ['_id', 'i32'],
    ['_deltaTime', 'f64'],
    ['elapsedTime', 'f64'],
    ['_lapNumber', 'i32'],
    ['lapStartET', 'f64'],
    ['vehicleName', 'u8', 64],
    ['trackName', 'u8', 64],
    ['_pos', vec3],
    ['localVel', vec3],
    ['_localAccel', vec3],
    ['_ori', vec3, 3],
    ['_localRot_localRotAccel', vec3, 2],
    ['_gear', 'i32'],
    ['_engineRPM_to_engineMaxRPM', 'f64', 23],
    ['_scheduledStops_to_headlights', 'u8', 4],
    ['_dentSeverity', 'u8', 8],
    ['_lastImpactET_lastImpactMagnitude', 'f64', 2],
    ['_lastImpactPos', vec3],
    ['_engineTorque', 'f64'],
    ['_currentSector', 'i32'],
    ['_speedLimiter_to_rearTireCompoundIndex', 'u8', 4],
    ['_fuelCapacity', 'f64'],
    ['_frontFlapActivated_to_ignitionStarter', 'u8', 4],
    ['_frontTireCompoundName', 'u8', 18],
    ['_rearTireCompoundName', 'u8', 18],
    ['_speedLimiterAvailable_antiStallActivated', 'u8', 2],
    ['_unused', 'u8', 2],
    ['_visualSteeringWheelRange', 'f32'],
    ['_rearBrakeBias_turboBoostPressure', 'f64', 2],
    ['_physicsToGraphicsOffset', 'f32', 3],
    ['_physicalSteeringWheelRange', 'f32'],
    ['_deltaBest_to_electricBoostWaterTemperature', 'f64', 6],
    ['_electricBoostMotorState', 'u8'],
    ['lapInvalidated', 'bool'],
    ['_absActive_tcActive_speedLimiterActive', 'bool', 3],
    ['_wiperState_to_trackLimitsSteps', 'u8', 19],
    ['_regen_to_timeGapPlaceBehind', 'f32', 7],
    ['vehicleModel', 'u8', 30],
    ['_vehicleClass_vehicleChampionship', 'u8', 2],
    ['_expansion', 'u8', 20],
    ['_wheel', wheel, 4],
  ],
  PLUGIN_PACK,
);

const vehicle = struct(
  [
    ['_id', 'i32'],
    ['_driverName', 'u8', 32],
    ['_vehicleName', 'u8', 64],
    ['_totalLaps', 'i16'],
    ['_sector_finishStatus', 'i8', 2],
    ['lapDist', 'f64'],
    ['_pathLateral_trackEdge', 'f64', 2],
    ['_bestSector1_to_lastSector2', 'f64', 5],
    ['lastLapTime', 'f64'],
    ['_curSector1_curSector2', 'f64', 2],
    ['_numPitstops_numPenalties', 'i16', 2],
    ['isPlayer', 'bool'],
    ['control', 'i8'],
    ['inPits', 'bool'],
    ['_place', 'u8'],
    ['vehicleClass', 'u8', 32],
    ['_timeBehindNext', 'f64'],
    ['_lapsBehindNext', 'i32'],
    ['_timeBehindLeader', 'f64'],
    ['_lapsBehindLeader', 'i32'],
    ['_lapStartET', 'f64'],
    ['_pos_to_localAccel', vec3, 3],
    ['_ori', vec3, 3],
    ['_localRot_localRotAccel', vec3, 2],
    ['_headlights_to_individualPhase', 'u8', 4],
    ['_qualification', 'i32'],
    ['_timeIntoLap_estimatedLapTime', 'f64', 2],
    ['_pitGroup', 'u8', 24],
    ['_flag_underYellow', 'u8', 2],
    ['countLapFlag', 'u8'],
    ['_inGarageStall', 'bool'],
    ['_upgradePack', 'u8', 16],
    ['_pitLapDist_to_bestLapSector2', 'f32', 3],
    ['_steamID', 'u64'],
    ['_vehFilename', 'u8', 32],
    ['_attackMode', 'i16'],
    ['_fuelFraction_drsState', 'u8', 2],
    ['_expansion', 'u8', 4],
  ],
  PLUGIN_PACK,
);

const scoringInfo = struct(
  [
    ['trackName', 'u8', 64],
    ['_session', 'i32'],
    ['currentET', 'f64'],
    ['_endET', 'f64'],
    ['_maxLaps', 'i32'],
    ['lapDist', 'f64'],
    ['_resultsStream', 'ptr'],
    ['numVehicles', 'i32'],
    ['_gamePhase_yellowFlagState', 'u8', 2],
    ['_sectorFlag', 'i8', 3],
    ['_startLight_numRedLights', 'u8', 2],
    ['inRealtime', 'bool'],
    ['_playerName', 'u8', 32],
    ['_plrFileName', 'u8', 64],
    ['_darkCloud_to_trackTemp', 'f64', 4],
    ['_wind', vec3],
    ['_minPathWetness_maxPathWetness', 'f64', 2],
    ['_gameMode_isPasswordProtected', 'u8', 2],
    ['_serverPort', 'u16'],
    ['_serverPublicIP', 'u32'],
    ['_maxPlayers', 'i32'],
    ['_serverName', 'u8', 32],
    ['_startET', 'f32'],
    ['_avgPathWetness', 'f64'],
    ['_sessionTimeRemaining_timeOfDay', 'f32', 2],
    ['_isFixedSetup_to_trackLimitsStepsPerPoint', 'u8', 5],
    ['_expansion', 'u8', 187],
    ['_vehicle', 'ptr'],
  ],
  PLUGIN_PACK,
);

const applicationState = struct(
  [
    ['_appWindow', 'ptr'],
    ['_width_to_windowed', 'u32', 4],
    ['_optionsLocation', 'u8'],
    ['_optionsPage', 'u8', 31],
    ['_expansion', 'u8', 204],
  ],
  PLUGIN_PACK,
);

const generic = struct([
  ['_events', 'u32', EVENT_COUNT],
  ['_gameVersion', 'i32'],
  ['_ffbTorque', 'f32'],
  ['_appInfo', applicationState],
]);

const paths = struct([['_paths', 'u8', MAX_PATH * 5]]);

const scoring = struct([
  ['info', scoringInfo],
  ['_scoringStreamSize', 'u64'],
  ['vehicles', vehicle, MAX_VEHICLES],
  ['_scoringStream', 'u8', 65536],
]);

const telemetry = struct([
  ['activeVehicles', 'u8'],
  ['playerVehicleIdx', 'u8'],
  ['playerHasVehicle', 'bool'],
  ['telemInfo', telem, MAX_VEHICLES],
]);

export const lmuLayout: Layout = struct([
  ['_generic', generic],
  ['_paths', paths],
  ['scoring', scoring],
  ['telemetry', telemetry],
]);

export const lmuStructs = { wheel, telem, vehicle, scoringInfo, scoring, telemetry };

const SCORING_INFO = lmuLayout.at.scoring! + scoring.at.info!;
const VEHICLES = lmuLayout.at.scoring! + scoring.at.vehicles!;
const TELEMETRY = lmuLayout.at.telemetry!;
const TELEM_INFO = TELEMETRY + telemetry.at.telemInfo!;

const CONTROL_LOCAL_PLAYER = 0;
const COUNT_LAP_AND_TIME = 2;
const MAX_EXTRAPOLATION_SECONDS = 0.5;
const PAGE = 4096;

export class LmuReader implements Reader {
  private playerSlot = -1;

  constructor(private readonly view: DataView) {}

  /** the block is a fixed struct, so its size says whether the game still matches these offsets */
  static create(view: DataView, log: Log): LmuReader | null {
    const slack = view.byteLength - lmuLayout.size;
    if (slack < 0 || slack >= PAGE) {
      log(`Le Mans Ultimate shared memory is ${view.byteLength} bytes, expected about ${lmuLayout.size}; skipping it`);
      return null;
    }
    return new LmuReader(view);
  }

  pulse(): number {
    return this.view.getFloat64(TELEM_INFO + telem.at.elapsedTime!, true);
  }

  poll(): Sample | null {
    const v = this.view;
    const count = v.getInt32(SCORING_INFO + scoringInfo.at.numVehicles!, true);
    const trackLength = v.getFloat64(SCORING_INFO + scoringInfo.at.lapDist!, true);
    if (count <= 0 || count > MAX_VEHICLES || !(trackLength > 0)) return null;
    if (v.getUint8(TELEMETRY + telemetry.at.playerHasVehicle!) === 0) return null;

    const car = this.player(count);
    const index = v.getUint8(TELEMETRY + telemetry.at.playerVehicleIdx!);
    if (car < 0 || index >= v.getUint8(TELEMETRY + telemetry.at.activeVehicles!)) return null;
    const t = TELEM_INFO + index * telem.size;

    const elapsed = v.getFloat64(t + telem.at.elapsedTime!, true);
    const vel = t + telem.at.localVel!;
    const speed = Math.hypot(v.getFloat64(vel, true), v.getFloat64(vel + 8, true), v.getFloat64(vel + 16, true));
    if (!Number.isFinite(elapsed) || !Number.isFinite(speed)) return null;

    // scoring refreshes a few times a second, telemetry far more often, so carry the scored
    // distance forward at the car's speed to the moment of the telemetry reading
    const since = elapsed - v.getFloat64(SCORING_INFO + scoringInfo.at.currentET!, true);
    const ahead = speed * Math.min(Math.max(since, 0), MAX_EXTRAPOLATION_SECONDS);
    const metres = v.getFloat64(car + vehicle.at.lapDist!, true) + ahead;
    const lapDist = (((metres % trackLength) + trackLength) % trackLength) / trackLength;

    const model = cstr(v, t + telem.at.vehicleModel!, 30) || cstr(v, car + vehicle.at.vehicleClass!, 32);
    const track = cstr(v, SCORING_INFO + scoringInfo.at.trackName!, 64);
    return {
      sim: 'Le Mans Ultimate',
      track,
      trackId: track,
      car: model || cstr(v, t + telem.at.vehicleName!, 64),
      carId: model || cstr(v, t + telem.at.vehicleName!, 64),
      trackLength,
      sessionTime: elapsed,
      live:
        v.getUint8(SCORING_INFO + scoringInfo.at.inRealtime!) !== 0 &&
        v.getInt8(car + vehicle.at.control!) === CONTROL_LOCAL_PLAYER,
      inPit: v.getUint8(car + vehicle.at.inPits!) !== 0,
      lapDist,
      lapTime: elapsed - v.getFloat64(t + telem.at.lapStartET!, true),
      lastLapTime: v.getFloat64(car + vehicle.at.lastLapTime!, true),
      speed,
      lapValid:
        v.getUint8(t + telem.at.lapInvalidated!) === 0 &&
        v.getUint8(car + vehicle.at.countLapFlag!) === COUNT_LAP_AND_TIME,
    };
  }

  /** offset of the player's scoring entry, which keeps its slot for as long as the session lasts */
  private player(count: number): number {
    const v = this.view;
    const cached = VEHICLES + this.playerSlot * vehicle.size;
    if (this.playerSlot >= 0 && this.playerSlot < count && v.getUint8(cached + vehicle.at.isPlayer!) !== 0)
      return cached;
    for (let i = 0; i < count; i++) {
      const at = VEHICLES + i * vehicle.size;
      if (v.getUint8(at + vehicle.at.isPlayer!) !== 0) {
        this.playerSlot = i;
        return at;
      }
    }
    this.playerSlot = -1;
    return -1;
  }
}
