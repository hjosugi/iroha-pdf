/// <reference types="node" />
/**
 * The first-run introduction on the library screen (#65): what it says, that it
 * goes away for good when skipped, that the sample becomes an ordinary library
 * document, and that someone who already has a library never sees it.
 *
 * The database is the real module over the real engine (`test-sqlite.ts`), so
 * "for good" means a row that a relaunch reads back. The file importer is a
 * double — it reaches for native file APIs — that writes the catalogue row the
 * real one would.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceDocument } from '@iroha-pdf/core';
import type * as TestSqlite from '../../test-sqlite';

vi.mock('expo-sqlite', () => import('../../test-sqlite'));

const alertFailure = vi.fn();
vi.mock('@/lib/alerts', () => ({
  alertFailure: (...args: unknown[]) => alertFailure(...args),
  confirmDestructive: (options: { onConfirm: () => void }) => options.onConfirm(),
}));

const importSamplePdf = vi.fn<(title: string) => Promise<WorkspaceDocument>>();
vi.mock('@/lib/files', () => ({
  importPdfFromSystem: vi.fn(),
  importSamplePdf: (title: string) => importSamplePdf(title),
  removeImportedDocument: vi.fn(),
}));

// Decorative, and drawn with react-native-svg, whose sources are not written for Node.
vi.mock('@/components/BrandMark', () => ({ BrandMark: () => null }));

vi.mock('@/lib/store-capture-native', () => ({
  readStoreCaptureScenario: () => null,
  markStoreCaptureReady: vi.fn(),
}));

let sqlite: typeof TestSqlite;
let database: typeof import('@/lib/database');
let directory: string;

const { default: LibraryRoute } = await import('@/app/index');

const SAMPLE: WorkspaceDocument = {
  id: 'pdf-sample',
  title: 'Iroha PDF sample',
  localUri: 'file:///documents/pdf-sample.pdf',
  mimeType: 'application/pdf',
  source: 'local',
  sizeBytes: 3580,
  modifiedAt: '2026-09-25T00:00:00.000Z',
};

/**
 * One database file for the whole file, emptied between tests. `database.ts`
 * memoises a setup that succeeded, and a fresh module per test would mean a fresh
 * copy of the screen's whole module graph; clearing rows is what a clean install
 * looks like to every query the screen makes.
 */
beforeAll(async () => {
  sqlite = (await import('expo-sqlite')) as unknown as typeof TestSqlite;
  database = await import('@/lib/database');
  directory = mkdtempSync(join(tmpdir(), 'iroha-pdf-onboarding-'));
  sqlite.useDatabaseFile(join(directory, 'iroha-pdf.db'));
  await database.initializeDatabase();
});

beforeEach(() => {
  sqlite.raw().exec(`
    DELETE FROM app_settings; DELETE FROM annotations; DELETE FROM notes;
    DELETE FROM write_journal; DELETE FROM documents;
  `);
  alertFailure.mockReset();
  importSamplePdf.mockReset().mockImplementation(async () => {
    await database.saveDocument(SAMPLE);
    return SAMPLE;
  });
});

afterAll(() => {
  sqlite.closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

function welcomeRow(): { value: string } | undefined {
  return sqlite.raw().prepare("SELECT value FROM app_settings WHERE key = 'onboarding.completedAt'").get() as
    | { value: string }
    | undefined;
}

describe('the first-run introduction', () => {
  it('says where files live, what Drive would see, and that originals are not written to', async () => {
    render(<LibraryRoute />);

    expect(await screen.findByText('Welcome to Iroha PDF')).toBeTruthy();
    expect(screen.getByText(/kept on this device/)).toBeTruthy();
    expect(screen.getByText(/drive\.file and drive\.appdata/)).toBeTruthy();
    expect(screen.getByText(/never written to/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try the sample PDF' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
  });

  it('goes away when skipped, and stays away', async () => {
    render(<LibraryRoute />);
    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }));

    await waitFor(() => expect(screen.queryByText('Welcome to Iroha PDF')).toBeNull());
    await waitFor(() => expect(welcomeRow()).toBeDefined());
    // The library behind it is still an empty library, and says so.
    expect(screen.getByText('No PDFs yet')).toBeTruthy();
    expect(importSamplePdf).not.toHaveBeenCalled();
  });

  it('puts the sample in the library as an ordinary document', async () => {
    render(<LibraryRoute />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try the sample PDF' }));

    await waitFor(() => expect(importSamplePdf).toHaveBeenCalledWith('Iroha PDF sample'));
    expect(await screen.findByText('Iroha PDF sample')).toBeTruthy();
    expect(screen.queryByText('Welcome to Iroha PDF')).toBeNull();
    expect(welcomeRow()).toBeDefined();
    expect((await database.listDocuments()).map((document) => document.id)).toEqual(['pdf-sample']);
  });

  it('is not shown over a library that already has something in it', async () => {
    await database.createNote('Existing note');
    render(<LibraryRoute />);

    expect(await screen.findByText('Existing note')).toBeTruthy();
    expect(screen.queryByText('Welcome to Iroha PDF')).toBeNull();
  });

  it('says so when the sample cannot be opened, without bringing the card back', async () => {
    importSamplePdf.mockRejectedValueOnce(new Error('asset missing'));
    render(<LibraryRoute />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try the sample PDF' }));

    await waitFor(() => expect(alertFailure).toHaveBeenCalled());
    expect(alertFailure.mock.calls[0]?.[0]).toBe('The sample PDF could not be opened');
    expect(screen.queryByText('Welcome to Iroha PDF')).toBeNull();
  });
});
