// Nothing that runs on a device runs on Node, so the app's tsconfig pulls in no Node
// types; the files that stand in for the native modules ask for them by name.
/// <reference types="node" />

/**
 * `expo-sqlite` for tests, backed by Node's own SQLite.
 *
 * The interesting parts of the mobile database layer are what SQLite does with the
 * statements it is given — WAL, foreign keys, `IF NOT EXISTS`, upsert clauses,
 * `ORDER BY`, locking — so a double that only records SQL strings would prove
 * nothing. `node:sqlite` is the same engine the device runs, driven through the
 * handful of methods `database.ts` uses, against a real file so that a "relaunch"
 * in a test is a second connection to the data the first one left behind.
 *
 * Nothing here is Expo-specific beyond the method names; the native module is not
 * loadable outside a device build, which is the only reason this file exists.
 */
import { DatabaseSync } from 'node:sqlite';

type BindValue = string | number | null | boolean | Uint8Array | ArrayBuffer;

let path = ':memory:';
let connection: DatabaseSync | undefined;
let contender: DatabaseSync | undefined;
let beforeTransaction: (() => void) | undefined;
const statements: string[] = [];

function bind(params: BindValue[]): (string | number | null | Uint8Array)[] {
  // node:sqlite has no boolean binding; SQLite stores them as integers either way.
  return params.map((value) => {
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    return value;
  });
}

/** Rows arrive with a null prototype, which upsets `toEqual` and spread-based reads. */
function plain<T>(row: unknown): T {
  return { ...(row as object) } as T;
}

function open(): DatabaseSync {
  connection ??= new DatabaseSync(path);
  return connection;
}

class FakeDatabase {
  async execAsync(source: string): Promise<void> {
    statements.push(source);
    open().exec(source);
  }

  async runAsync(source: string, ...params: BindValue[]): Promise<{ lastInsertRowId: number; changes: number }> {
    statements.push(source);
    const result = open().prepare(source).run(...bind(params));
    return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
  }

  async getAllAsync<T>(source: string, ...params: BindValue[]): Promise<T[]> {
    statements.push(source);
    return open()
      .prepare(source)
      .all(...bind(params))
      .map((row) => plain<T>(row));
  }

  async getFirstAsync<T>(source: string, ...params: BindValue[]): Promise<T | null> {
    statements.push(source);
    const row = open()
      .prepare(source)
      .get(...bind(params));
    return row === undefined ? null : plain<T>(row);
  }

  /** Commits on success and rolls back on a throw, the way the native module does. */
  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    beforeTransaction?.();
    beforeTransaction = undefined;
    const db = open();
    db.exec('BEGIN');
    try {
      await task();
      db.exec('COMMIT');
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // SQLite already unwound it; the caller cares about the original failure.
      }
      throw error;
    }
  }
}

let openFailure: Error | undefined;

export async function openDatabaseAsync(_databaseName: string): Promise<FakeDatabase> {
  if (openFailure) {
    const failure = openFailure;
    openFailure = undefined;
    throw failure;
  }
  return new FakeDatabase();
}

/**
 * Fails the next open, once. A device can refuse to open the file — a full disk,
 * a corrupt database, another process holding it — and that is a different path
 * from a failure while laying the schema down.
 */
export function failNextOpen(message = 'unable to open database file'): void {
  openFailure = new Error(message);
}

/**
 * Points the next `openDatabaseAsync` at a file. Passing the same path again after
 * `vi.resetModules()` is how a test relaunches the app over its own data.
 */
export function useDatabaseFile(file: string): void {
  closeDatabase();
  openFailure = undefined;
  path = file;
  beforeTransaction = undefined;
  statements.length = 0;
}

/** A second connection, for arranging and inspecting rows the app has no reader for. */
export function raw(): DatabaseSync {
  return open();
}

/** Every statement the module under test has issued since the file was chosen. */
export function issuedStatements(): readonly string[] {
  return statements;
}

/**
 * Takes the write lock from another connection, which is what a second process — or
 * the app's own background sync — looks like to SQLite: every write from the module
 * under test then fails with `database is locked` until it is given back.
 */
export function holdWriteLock(): void {
  contender ??= new DatabaseSync(path);
  contender.exec('BEGIN IMMEDIATE');
}

export function releaseWriteLock(): void {
  contender?.exec('ROLLBACK');
}

/** SQLite's own ceiling, and what `max_page_count` returns to when the disk is given back. */
const DEFAULT_MAX_PAGE_COUNT = 1073741823;

/**
 * Caps the database at the pages it already occupies, which is what a device out of
 * storage looks like from inside SQLite: anything that needs a new page fails with
 * `SQLITE_FULL` — `database or disk is full` — exactly as it does on a real full disk.
 *
 * Filling a temporary directory for real would be measured in gigabytes and would
 * take the machine running the tests down with it.
 */
export function exhaustStorage(): void {
  const db = open();
  const { page_count: pages } = db.prepare('PRAGMA page_count').get() as { page_count: number };
  db.exec(`PRAGMA max_page_count = ${pages}`);
}

export function restoreStorage(): void {
  open().exec(`PRAGMA max_page_count = ${DEFAULT_MAX_PAGE_COUNT}`);
}

/** Runs once, just before the next transaction opens. */
export function onNextTransaction(hook: () => void): void {
  beforeTransaction = hook;
}

export function closeDatabase(): void {
  for (const open of [contender, connection]) {
    // A connection left mid-transaction refuses to close until it is unwound.
    try {
      open?.exec('ROLLBACK');
    } catch {
      // Nothing was open.
    }
    open?.close();
  }
  contender = undefined;
  connection = undefined;
}
