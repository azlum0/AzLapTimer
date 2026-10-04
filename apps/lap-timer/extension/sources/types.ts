import type { Sample } from '../../src/shared/protocol.ts';

export type Log = (message: string) => void;

/** reads one sim's memory block; takes a plain DataView so it can be tested against a buffer */
export interface Reader {
  /** null while the sim has no session loaded */
  poll(): Sample | null;
  /** a number that moves whenever the sim writes fresh data */
  pulse(): number;
}

export interface TelemetrySource extends Reader {
  close(): void;
}

export interface SourceFactory {
  name: string;
  /** null when the sim is not running */
  open(log: Log): TelemetrySource | null;
}
