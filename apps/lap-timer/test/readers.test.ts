import { describe, expect, test } from 'bun:test';
import { cstr, struct } from '../extension/layout.ts';
import { ams2Layout, Ams2Reader } from '../extension/sources/ams2.ts';
import { IRacingReader, parseSessionInfo } from '../extension/sources/iracing.ts';
import { lmuLayout, LmuReader, lmuStructs } from '../extension/sources/lmu.ts';
import { r3eLayout, R3eReader, r3eStructs } from '../extension/sources/r3e.ts';

const ascii = (view: DataView, offset: number, text: string) => {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
};

describe('struct layout', () => {
  test('aligns fields the way the compiler does', () => {
    const s = struct([
      ['a', 'u8'],
      ['b', 'f64'],
      ['c', 'u8'],
      ['d', 'i32'],
    ]);
    expect(s.at).toEqual({ a: 0, b: 8, c: 16, d: 20 });
    expect(s.size).toBe(24);
    expect(s.align).toBe(8);
  });

  test('honours packing', () => {
    const packed4 = struct(
      [
        ['a', 'i32'],
        ['b', 'f64'],
        ['c', 'u8'],
      ],
      4,
    );
    expect(packed4.at).toEqual({ a: 0, b: 4, c: 12 });
    expect(packed4.size).toBe(16);
    const packed1 = struct(
      [
        ['a', 'u8'],
        ['b', 'f64'],
      ],
      1,
    );
    expect(packed1.at.b).toBe(1);
    expect(packed1.size).toBe(9);
  });

  test('nests a struct at its own alignment', () => {
    const inner = struct([['x', 'f64', 3]], 4);
    const outer = struct([
      ['flag', 'u8'],
      ['inner', inner, 2],
      ['count', 'u64'],
    ]);
    expect(outer.at).toEqual({ flag: 0, inner: 4, count: 56 });
  });

  test('reads a terminated string out of a fixed array', () => {
    const view = new DataView(new ArrayBuffer(16));
    ascii(view, 4, 'Spa');
    expect(cstr(view, 4, 8)).toBe('Spa');
  });
});

describe('iRacing', () => {
  const yaml = [
    '---',
    'WeekendInfo:',
    ' TrackName: spa 2024 gp',
    ' TrackLength: 6.93 km',
    ' TrackDisplayName: Circuit de Spa-Francorchamps',
    ' TrackConfigName: Grand Prix Pits',
    'SessionInfo:',
    ' Sessions:',
    ' - SessionNum: 0',
    '   ResultsFastestLap:',
    '   - CarIdx: 7',
    '     FastestLap: 5',
    '     FastestTime: 100.8197',
    'DriverInfo:',
    ' DriverCarIdx: 7',
    ' Drivers:',
    ' - CarIdx: 0',
    '   CarPath: safety pcporsche911cup',
    '   CarScreenName: Pace Car',
    ' - CarIdx: 7',
    '   CarPath: mx5 mx52016',
    '   CarScreenName: Mazda MX-5 Cup',
    ' - CarIdx: 17',
    '   CarPath: bmwm4gt3',
    '   CarScreenName: BMW M4 GT3',
    '...',
  ].join('\n');

  test('picks the track and the player car out of the session string', () => {
    expect(parseSessionInfo(yaml)).toEqual({
      track: 'Circuit de Spa-Francorchamps Grand Prix Pits',
      trackId: 'spa 2024 gp/Grand Prix Pits',
      trackLength: 6930,
      car: 'Mazda MX-5 Cup',
      carId: 'mx5 mx52016',
    });
  });

  function memory() {
    const vars: [name: string, type: number, value: number][] = [
      ['SessionTime', 5, 123.5],
      ['IsOnTrack', 1, 1],
      ['IsReplayPlaying', 1, 0],
      ['OnPitRoad', 1, 0],
      ['PlayerTrackSurface', 2, 3],
      ['LapDistPct', 4, 0.25],
      ['LapCurrentLapTime', 4, 30.5],
      ['LapLastLapTime', 4, 95.25],
      ['Speed', 4, 50],
      ['Gear', 2, 4],
      ['LapBestLapTime', 4, 94.5],
      ['PlayerCarMyIncidentCount', 2, 3],
      ['LapDeltaToBestLap', 4, 0.5],
      ['LapDeltaToBestLap_DD', 4, 0],
      ['LapDeltaToBestLap_OK', 1, 0],
      ['LapDeltaToSessionBestLap', 4, -0.25],
      ['LapDeltaToSessionBestLap_DD', 4, 0.125],
      ['LapDeltaToSessionBestLap_OK', 1, 1],
      ['LapDeltaToSessionLastlLap', 4, 1.5],
      ['LapDeltaToSessionLastlLap_DD', 4, 0],
      ['LapDeltaToSessionLastlLap_OK', 1, 1],
    ];
    const view = new DataView(new ArrayBuffer(8192));
    const headers = 112;
    const info = headers + vars.length * 144;
    const rows = [4096, 5120];
    view.setInt32(4, 1, true);
    view.setInt32(12, 1, true);
    view.setInt32(16, yaml.length + 1, true);
    view.setInt32(20, info, true);
    view.setInt32(24, vars.length, true);
    view.setInt32(28, headers, true);
    view.setInt32(32, rows.length, true);
    ascii(view, info, yaml);
    rows.forEach((row, i) => {
      view.setInt32(48 + i * 16, 10 + i, true);
      view.setInt32(48 + i * 16 + 4, row, true);
    });
    let offset = 0;
    vars.forEach(([name, type, value], i) => {
      const at = headers + i * 144;
      view.setInt32(at, type, true);
      view.setInt32(at + 4, offset, true);
      ascii(view, at + 16, name);
      // the older row holds stale numbers, to prove the newest is the one read
      for (const [row, scale] of [
        [rows[0]!, 0],
        [rows[1]!, 1],
      ] as const) {
        if (type === 1) view.setUint8(row + offset, value * scale);
        else if (type === 2) view.setInt32(row + offset, value * scale, true);
        else if (type === 4) view.setFloat32(row + offset, value * scale, true);
        else view.setFloat64(row + offset, value * scale, true);
      }
      offset += type === 1 ? 1 : type === 5 ? 8 : 4;
    });
    return view;
  }

  test('reads the newest telemetry row', () => {
    const view = memory();
    const reader = new IRacingReader(view);
    expect(reader.poll()).toEqual({
      sim: 'iRacing',
      track: 'Circuit de Spa-Francorchamps Grand Prix Pits',
      trackId: 'spa 2024 gp/Grand Prix Pits',
      trackLength: 6930,
      car: 'Mazda MX-5 Cup',
      carId: 'mx5 mx52016',
      sessionTime: 123.5,
      live: true,
      inPit: false,
      lapDist: 0.25,
      lapTime: 30.5,
      lastLapTime: 95.25,
      speed: 50,
      lapValid: true,
      simDelta: {
        best: { delta: null, rate: 0, refTime: null },
        session: { delta: -0.25, rate: 0.125, refTime: 94.5 },
        last: { delta: 1.5, rate: 0, refTime: 95.25 },
      },
    });
    expect(reader.pulse()).toBe(11);
  });

  test('an incident spoils the lap it happens on', () => {
    const view = memory();
    const reader = new IRacingReader(view);
    expect(reader.poll()!.lapValid).toBe(true);
    setInt(view, 'PlayerCarMyIncidentCount', 4);
    expect(reader.poll()!.lapValid).toBe(false);
    expect(reader.poll()!.lapValid).toBe(true);
  });

  /** writes an int variable into the newest telemetry row, finding it the way the reader does */
  function setInt(view: DataView, name: string, value: number) {
    const base = view.getInt32(28, true);
    for (let i = 0; i < view.getInt32(24, true); i++) {
      const at = base + i * 144;
      if (cstr(view, at + 16, 32) !== name) continue;
      const newest = view.getInt32(48, true) > view.getInt32(64, true) ? 0 : 1;
      view.setInt32(view.getInt32(52 + newest * 16, true) + view.getInt32(at + 4, true), value, true);
      return;
    }
    throw new Error(`no variable ${name}`);
  }

  test('reports nothing while the sim is not connected', () => {
    const view = memory();
    view.setInt32(4, 0, true);
    expect(new IRacingReader(view).poll()).toBeNull();
  });
});

describe('Le Mans Ultimate', () => {
  test('struct sizes match the plugin interface', () => {
    expect(lmuStructs.wheel.size).toBe(260);
    expect(lmuStructs.telem.size).toBe(1888);
    expect(lmuStructs.vehicle.size).toBe(584);
    expect(lmuStructs.scoringInfo.size).toBe(548);
  });

  function memory() {
    const { telem, vehicle, scoringInfo, scoring, telemetry } = lmuStructs;
    const view = new DataView(new ArrayBuffer(lmuLayout.size + 100));
    const info = lmuLayout.at.scoring! + scoring.at.info!;
    const car = lmuLayout.at.scoring! + scoring.at.vehicles! + 2 * vehicle.size;
    const telemetryAt = lmuLayout.at.telemetry!;
    const t = telemetryAt + telemetry.at.telemInfo! + 1 * telem.size;

    ascii(view, info + scoringInfo.at.trackName!, 'Circuit de la Sarthe');
    view.setFloat64(info + scoringInfo.at.currentET!, 99.9, true);
    view.setFloat64(info + scoringInfo.at.lapDist!, 13626, true);
    view.setInt32(info + scoringInfo.at.numVehicles!, 5, true);
    view.setUint8(info + scoringInfo.at.inRealtime!, 1);

    view.setFloat64(car + vehicle.at.lapDist!, 6803, true);
    view.setFloat64(car + vehicle.at.lastLapTime!, 208.4, true);
    view.setUint8(car + vehicle.at.isPlayer!, 1);
    view.setInt8(car + vehicle.at.control!, 0);
    view.setUint8(car + vehicle.at.countLapFlag!, 2);

    view.setUint8(telemetryAt + telemetry.at.activeVehicles!, 5);
    view.setUint8(telemetryAt + telemetry.at.playerVehicleIdx!, 1);
    view.setUint8(telemetryAt + telemetry.at.playerHasVehicle!, 1);
    view.setFloat64(t + telem.at.elapsedTime!, 100, true);
    view.setFloat64(t + telem.at.lapStartET!, 40, true);
    view.setFloat64(t + telem.at.localVel! + 16, -100, true);
    ascii(view, t + telem.at.vehicleModel!, 'Ferrari 499P');
    return view;
  }

  test('reads the player and carries the scored distance forward', () => {
    const reader = LmuReader.create(memory(), () => {})!;
    const sample = reader.poll()!;
    expect(sample.track).toBe('Circuit de la Sarthe');
    expect(sample.car).toBe('Ferrari 499P');
    expect(sample.live).toBe(true);
    expect(sample.lapValid).toBe(true);
    expect(sample.sessionTime).toBe(100);
    expect(sample.lapTime).toBeCloseTo(60, 6);
    expect(sample.lastLapTime).toBeCloseTo(208.4, 6);
    expect(sample.speed).toBe(100);
    // 6803 m scored a tenth of a second ago at 100 m/s
    expect(sample.lapDist).toBeCloseTo(6813 / 13626, 6);
  });

  test('refuses a block that is not the size it expects', () => {
    const messages: string[] = [];
    expect(LmuReader.create(new DataView(new ArrayBuffer(lmuLayout.size - 8)), m => messages.push(m))).toBeNull();
    expect(LmuReader.create(new DataView(new ArrayBuffer(lmuLayout.size + 8192)), m => messages.push(m))).toBeNull();
    expect(messages.length).toBe(2);
  });
});

describe('Automobilista 2', () => {
  function memory() {
    const at = ams2Layout.at;
    const view = new DataView(new ArrayBuffer(ams2Layout.size + 4096));
    view.setUint32(at.version!, 14, true);
    view.setUint32(at.gameState!, 2, true);
    view.setInt32(at.viewedParticipantIndex!, 1, true);
    view.setInt32(at.numParticipants!, 3, true);
    // one participant is 100 bytes, with its lap distance 80 bytes in
    view.setFloat32(at.participants! + 100 + 80, 1500, true);
    ascii(view, at.carName!, 'Stock Car Brasil');
    ascii(view, at.trackLocation!, 'Interlagos');
    ascii(view, at.trackVariation!, 'GP');
    view.setFloat32(at.trackLength!, 4309, true);
    view.setFloat32(at.lastLapTime!, 92.5, true);
    view.setFloat32(at.currentTime!, 31.25, true);
    view.setFloat32(at.speed!, 61, true);
    view.setUint32(at.sequenceNumber!, 8, true);
    return view;
  }

  test('reads the viewed car and runs its own clock', () => {
    let now = 10;
    const view = memory();
    const reader = new Ams2Reader(view, () => now);
    const first = reader.poll()!;
    expect(first.track).toBe('Interlagos GP');
    expect(first.car).toBe('Stock Car Brasil');
    expect(first.live).toBe(true);
    expect(first.lapDist).toBeCloseTo(1500 / 4309, 6);
    expect(first.lapTime).toBe(31.25);
    expect(first.lastLapTime).toBe(92.5);
    expect(first.speed).toBe(61);
    expect(first.sessionTime).toBe(0);
    now += 0.016;
    expect(reader.poll()!.sessionTime).toBeCloseTo(0.016, 6);

    // paused: the clock holds
    view.setUint32(ams2Layout.at.gameState!, 3, true);
    now += 30;
    expect(reader.poll()!.live).toBe(false);
    view.setUint32(ams2Layout.at.gameState!, 2, true);
    now += 0.016;
    expect(reader.poll()!.sessionTime).toBeCloseTo(0.016, 6);
  });

  test('waits out a write in progress', () => {
    const view = memory();
    view.setUint32(ams2Layout.at.sequenceNumber!, 9, true);
    expect(new Ams2Reader(view, () => 0).poll()).toBeNull();
  });

  test('refuses a version it does not know', () => {
    const view = memory();
    view.setUint32(ams2Layout.at.version!, 0, true);
    expect(Ams2Reader.create(view, () => {})).toBeNull();
    view.setUint32(ams2Layout.at.version!, 14, true);
    expect(Ams2Reader.create(view, () => {})).not.toBeNull();
  });
});

describe('RaceRoom', () => {
  function memory() {
    const at = r3eLayout.at;
    const view = new DataView(new ArrayBuffer(r3eLayout.size + 4096));
    view.setInt32(at.versionMajor!, 3, true);
    view.setInt32(at.allDriversOffset!, at.allDrivers!, true);
    view.setInt32(at.driverDataSize!, r3eStructs.driverData.size, true);
    view.setFloat64(at.player! + r3eStructs.playerData.at.simulationTime!, 250.5, true);
    ascii(view, at.trackName!, 'Zandvoort');
    ascii(view, at.layoutName!, 'Grand Prix');
    view.setInt32(at.layoutId!, 1678, true);
    view.setFloat32(at.layoutLength!, 4259, true);
    view.setInt32(at.currentLapValid!, 1, true);
    view.setFloat32(at.lapDistanceFraction!, 0.5, true);
    view.setFloat32(at.lapTimePreviousSelf!, 97.5, true);
    view.setFloat32(at.lapTimeCurrentSelf!, 48.25, true);
    view.setInt32(at.vehicleInfo! + r3eStructs.driverInfo.at.modelId!, 5383, true);
    view.setFloat32(at.carSpeed!, 55, true);
    return view;
  }

  test('reads the player', () => {
    const reader = R3eReader.create(memory(), () => {})!;
    expect(reader.poll()).toEqual({
      sim: 'RaceRoom',
      track: 'Zandvoort Grand Prix',
      trackId: '1678',
      car: 'Car 5383',
      carId: '5383',
      trackLength: 4259,
      sessionTime: 250.5,
      live: true,
      inPit: false,
      lapDist: 0.5,
      lapTime: 48.25,
      lastLapTime: 97.5,
      speed: 55,
      lapValid: true,
    });
  });

  test('refuses a block whose driver array is not where it expects', () => {
    const view = memory();
    view.setInt32(r3eLayout.at.allDriversOffset!, r3eLayout.at.allDrivers! + 4, true);
    const messages: string[] = [];
    expect(R3eReader.create(view, m => messages.push(m))).toBeNull();
    expect(messages.length).toBe(1);
  });
});
