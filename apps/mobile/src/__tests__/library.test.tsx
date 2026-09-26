/// <reference types="node" />
/**
 * #5 asks that a migration failure reach the user. `database.test.ts` proves setup
 * retries after one; this proves the other half — that the library screen, which
 * is where that failure surfaces, says so and keeps saying so.
 *
 * The database here is the real module over the real engine (see
 * `test-sqlite.ts`), and the migration fails for a real reason: the file on disk
 * has a `documents` the `ALTER TABLE` cannot extend. Only the alert, the native
 * file-picker and capture modules, and the decorative SVG mark are doubles.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as TestSqlite from '../../test-sqlite';

vi.mock('expo-sqlite', () => import('../../test-sqlite'));

const alertFailure = vi.fn();
vi.mock('@/lib/alerts', () => ({
  alertFailure: (...args: unknown[]) => alertFailure(...args),
  confirmDestructive: (options: { onConfirm: () => void }) => options.onConfirm(),
}));

vi.mock('@/lib/files', () => ({
  importPdfFromSystem: vi.fn(),
  removeImportedDocument: vi.fn(),
}));

// The mark is decorative (hidden from assistive technology) and drawn with
// react-native-svg, whose sources are not written for Node.
vi.mock('@/components/BrandMark', () => ({ BrandMark: () => null }));

vi.mock('@/lib/store-capture-native', () => ({
  readStoreCaptureScenario: () => null,
  markStoreCaptureReady: vi.fn(),
}));

let sqlite: typeof TestSqlite;
let directory: string;

/**
 * Loaded once, not per test. `database.ts` memoises a setup that succeeded, so
 * the tests below run in the order a device would meet them: a launch whose open
 * fails, then one whose migration fails and is repaired. Neither leaves a
 * successful setup behind for the next to inherit, until the last step.
 */
const { default: LibraryRoute } = await import('@/app/index');

/**
 * A database an older build left behind whose `documents` the migration cannot
 * alter. A view reports its columns through `PRAGMA table_info` like a table does,
 * so setup sees `last_opened_at` missing, and `ALTER TABLE` then refuses it.
 */
function arrangeUnmigratableLibrary(): void {
  // The connection the app will use; it stays open so the app finds this state.
  const db = sqlite.raw();
  db.exec(`
    CREATE TABLE legacy_documents (
      id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, local_uri TEXT NOT NULL,
      source TEXT NOT NULL, source_id TEXT, source_revision TEXT, page_count INTEGER,
      size_bytes INTEGER, modified_at TEXT NOT NULL
    );
    INSERT INTO legacy_documents (id, title, local_uri, source, size_bytes, modified_at)
      VALUES ('doc-1', 'Lease agreement', 'file:///documents/doc-1.pdf', 'local', 2048, '2026-01-01T00:00:00.000Z');
    CREATE VIEW documents AS SELECT * FROM legacy_documents;
  `);
}

/** What a fixed build would do to that file: a real table the migration can extend. */
function repairLibrary(): void {
  sqlite.raw().exec(`
    DROP VIEW documents;
    ALTER TABLE legacy_documents RENAME TO documents;
  `);
}

beforeEach(async () => {
  sqlite = (await import('expo-sqlite')) as unknown as typeof TestSqlite;
  directory = mkdtempSync(join(tmpdir(), 'iroha-pdf-library-'));
  sqlite.useDatabaseFile(join(directory, 'iroha-pdf.db'));
  alertFailure.mockReset();
});

afterEach(() => {
  sqlite.closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

describe('the library screen', () => {
  it('reports a database that could not be opened, and does not claim the library is empty', async () => {
    sqlite.failNextOpen('database or disk is full');
    render(<LibraryRoute />);

    expect(await screen.findByText('The library could not be read')).toBeTruthy();
    // The empty states are what a failure used to render as, and each is a
    // claim about the user's data that nobody checked.
    expect(screen.queryByText('No PDFs yet')).toBeNull();
    expect(screen.queryByText('Create a note to keep context beside your PDFs.')).toBeNull();
    await waitFor(() => expect(alertFailure).toHaveBeenCalled());
    const [title, error] = alertFailure.mock.calls[0] as [string, Error];
    expect(title).toBe('Local storage unavailable');
    expect(error.message).toContain('disk is full');
  });

  it('reports a failed migration with its reason, then shows the library once a retry can set it up', async () => {
    arrangeUnmigratableLibrary();
    render(<LibraryRoute />);

    expect(await screen.findByText('The library could not be read')).toBeTruthy();
    expect(screen.queryByText('No PDFs yet')).toBeNull();
    await waitFor(() => expect(alertFailure).toHaveBeenCalled());
    const [title, error] = alertFailure.mock.calls[0] as [string, Error];
    expect(title).toBe('Local storage unavailable');
    // SQLite's own words, not a generic failure: the alert is where someone
    // reporting the problem finds what to report.
    expect(error.message).toMatch(/view/i);

    const retry = screen.getByRole('button', { name: 'Try again' });
    repairLibrary();
    fireEvent.click(retry);

    expect(await screen.findByText('Lease agreement')).toBeTruthy();
    expect(screen.queryByText('The library could not be read')).toBeNull();
    // The migration really ran: the column it adds is there now.
    const columns = sqlite.raw().prepare('PRAGMA table_info(documents)').all() as { name: string }[];
    expect(columns.map((column) => column.name)).toContain('last_opened_at');
  });
});
