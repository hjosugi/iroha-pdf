import type { SyncOperation } from './types';

export type SyncCursor = {
  provider: string;
  token: string;
  updatedAt: string;
};

export type SyncBundle = {
  schemaVersion: 1;
  deviceId: string;
  operations: SyncOperation[];
  createdAt: string;
};

export interface SyncProvider {
  pull(cursor?: SyncCursor): Promise<{ bundle: SyncBundle; cursor: SyncCursor }>;
  push(bundle: SyncBundle, cursor?: SyncCursor): Promise<SyncCursor>;
}

export function createSyncBundle(deviceId: string, operations: SyncOperation[]): SyncBundle {
  return {
    schemaVersion: 1,
    deviceId,
    operations,
    createdAt: new Date().toISOString(),
  };
}

export function nextLogicalClock(localClock: number, remoteClock?: number): number {
  return Math.max(localClock, remoteClock ?? 0) + 1;
}
