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

export type SyncQueueStatus = 'pending' | 'in-flight' | 'auth-required' | 'failed';

export type SyncQueueEntry = {
  id: string;
  idempotencyKey: string;
  operation: SyncOperation;
  status: SyncQueueStatus;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
};

export interface SyncQueueStore {
  load(): Promise<SyncQueueEntry[]>;
  save(entries: SyncQueueEntry[]): Promise<void>;
}

export type SyncQueueResult = 'success' | 'retry' | 'auth-required';

export type SyncQueueOptions = {
  now?: () => number;
  random?: () => number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

/** Durable, serialized operation queue. A SQLite-backed store can be supplied
 * on mobile/desktop without coupling core to either SQLite runtime. */
export class DurableSyncQueue {
  private entries: SyncQueueEntry[] | undefined;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(private readonly store: SyncQueueStore, options: SyncQueueOptions = {}) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.baseDelayMs = options.baseDelayMs ?? 1_000;
    this.maxDelayMs = options.maxDelayMs ?? 5 * 60_000;
  }

  private async read(): Promise<SyncQueueEntry[]> {
    this.entries ??= await this.store.load();
    return this.entries;
  }

  async enqueue(operation: SyncOperation, idempotencyKey = operation.id): Promise<SyncQueueEntry> {
    const entries = await this.read();
    const existing = entries.find((entry) => entry.idempotencyKey === idempotencyKey);
    if (existing) return existing;
    const entry: SyncQueueEntry = {
      id: operation.id,
      idempotencyKey,
      operation,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: this.now(),
    };
    entries.push(entry);
    await this.store.save(entries);
    return entry;
  }

  async list(): Promise<readonly SyncQueueEntry[]> {
    return (await this.read()).map((entry) => ({ ...entry }));
  }

  async drain(
    send: (operation: SyncOperation, idempotencyKey: string) => Promise<SyncQueueResult>,
  ): Promise<{ processed: number; remaining: number; authRequired: boolean }> {
    const entries = await this.read();
    let processed = 0;
    let authRequired = false;

    if (entries.some((entry) => entry.status === 'auth-required')) {
      return { processed: 0, remaining: entries.length, authRequired: true };
    }

    for (const entry of [...entries]) {
      if (entry.nextAttemptAt > this.now()) continue;
      entry.status = 'in-flight';
      await this.store.save(entries);
      try {
        const result = await send(entry.operation, entry.idempotencyKey);
        if (result === 'success') {
          entries.splice(entries.indexOf(entry), 1);
          processed += 1;
        } else if (result === 'auth-required') {
          entry.status = 'auth-required';
          authRequired = true;
          break;
        } else {
          this.scheduleRetry(entry, 'retry requested');
        }
      } catch (error) {
        this.scheduleRetry(entry, error instanceof Error ? error.message : String(error));
      }
      await this.store.save(entries);
    }

    await this.store.save(entries);
    return { processed, remaining: entries.length, authRequired };
  }

  private scheduleRetry(entry: SyncQueueEntry, message: string): void {
    entry.attempts += 1;
    entry.status = 'failed';
    entry.lastError = message;
    const ceiling = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** (entry.attempts - 1));
    entry.nextAttemptAt = this.now() + Math.floor(ceiling * (0.5 + this.random() * 0.5));
  }

  async retry(id?: string): Promise<void> {
    const entries = await this.read();
    for (const entry of entries) {
      if (id && entry.id !== id) continue;
      entry.status = 'pending';
      entry.nextAttemptAt = this.now();
      delete entry.lastError;
    }
    await this.store.save(entries);
  }
}

export type SqliteSyncQueueDatabase = {
  exec(sql: string, parameters?: readonly unknown[]): Promise<void>;
  all<T>(sql: string, parameters?: readonly unknown[]): Promise<T[]>;
};

/** Minimal SQLite store; adapters only need exec/all and can wrap expo-sqlite,
 * better-sqlite3, or Tauri SQL. */
export class SqliteSyncQueueStore implements SyncQueueStore {
  constructor(private readonly database: SqliteSyncQueueDatabase) {}

  async initialize(): Promise<void> {
    await this.database.exec(`CREATE TABLE IF NOT EXISTS iroha_sync_queue (
      id TEXT PRIMARY KEY NOT NULL,
      idempotency_key TEXT UNIQUE NOT NULL,
      entry_json TEXT NOT NULL
    )`);
  }

  async load(): Promise<SyncQueueEntry[]> {
    await this.initialize();
    const rows = await this.database.all<{ entry_json: string }>(
      'SELECT entry_json FROM iroha_sync_queue ORDER BY rowid',
    );
    return rows.map((row) => JSON.parse(row.entry_json) as SyncQueueEntry);
  }

  async save(entries: SyncQueueEntry[]): Promise<void> {
    await this.initialize();
    await this.database.exec('BEGIN IMMEDIATE');
    try {
      await this.database.exec('DELETE FROM iroha_sync_queue');
      for (const entry of entries) {
        await this.database.exec(
          'INSERT INTO iroha_sync_queue (id, idempotency_key, entry_json) VALUES (?, ?, ?)',
          [entry.id, entry.idempotencyKey, JSON.stringify(entry)],
        );
      }
      await this.database.exec('COMMIT');
    } catch (error) {
      await this.database.exec('ROLLBACK');
      throw error;
    }
  }
}
