import { describe, expect, it, vi } from 'vitest';

import {
  DriveAppDataRepository,
  DriveChangesSynchronizer,
  GoogleDriveClient,
  type DriveFile,
} from './index';

describe('GoogleDriveClient', () => {
  it('uses minimum scopes indirectly by listing only visible PDF files', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toContain("mimeType%3D%27application%2Fpdf%27");
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token');
      return new Response(JSON.stringify({ files: [] }), { status: 200 });
    });
    const client = new GoogleDriveClient({
      getAccessToken: async () => 'token',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(client.listPdfFiles()).resolves.toEqual({ files: [] });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('paginates every app-visible PDF and stores a download in the offline cache', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.searchParams.get('alt') === 'media') {
        return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Length': '3' } });
      }
      if (url.pathname.endsWith('/files/a')) {
        return Response.json({ id: 'a', name: 'a.pdf', mimeType: 'application/pdf' });
      }
      return url.searchParams.get('pageToken') === 'next'
        ? Response.json({ files: [{ id: 'b', name: 'b.pdf', mimeType: 'application/pdf' }] })
        : Response.json({ files: [{ id: 'a', name: 'a.pdf', mimeType: 'application/pdf' }], nextPageToken: 'next' });
    });
    const client = new GoogleDriveClient({ getAccessToken: async () => 'token', fetchImpl: fetchImpl as typeof fetch });
    expect((await client.listAllPdfFiles()).map((file) => file.id)).toEqual(['a', 'b']);

    const put = vi.fn();
    const progress = vi.fn();
    await client.downloadToCache('a', { put }, { onProgress: progress });
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), new Uint8Array([1, 2, 3]));
    expect(progress).toHaveBeenLastCalledWith({ loaded: 3, total: 3 });
  });

  it('uploads an existing file in resumable chunks and reports the resulting version', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      if (String(input).includes('uploadType=resumable')) {
        return new Response(null, { status: 200, headers: { Location: 'https://upload.test/session' } });
      }
      const range = new Headers(init?.headers).get('Content-Range');
      if (range === 'bytes 0-262143/262146') {
        return new Response(null, { status: 308, headers: { Range: 'bytes=0-262143' } });
      }
      return Response.json({ id: 'existing', name: 'large.pdf', mimeType: 'application/pdf', version: '42' });
    });
    const client = new GoogleDriveClient({ getAccessToken: async () => 'token', fetchImpl: fetchImpl as typeof fetch });
    const progress = vi.fn();
    const result = await client.uploadPdfResumable({
      name: 'large.pdf', bytes: new Uint8Array(262_146), existingFileId: 'existing',
      options: { chunkSize: 256 * 1024, onProgress: progress },
    });
    expect(result.version).toBe('42');
    expect(requests[0]?.init?.method).toBe('PATCH');
    expect(progress.mock.calls.map(([value]) => value.loaded)).toEqual([262_144, 262_146]);
  });

  it('resumes from a persisted upload offset without starting a new session', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const range = new Headers(init?.headers).get('Content-Range');
      if (range === 'bytes */6') {
        return new Response(null, { status: 308, headers: { Range: 'bytes=0-3' } });
      }
      expect(range).toBe('bytes 4-5/6');
      return Response.json({ id: 'file', name: 'large.pdf', mimeType: 'application/pdf' });
    });
    const client = new GoogleDriveClient({ getAccessToken: async () => 'token', fetchImpl: fetchImpl as typeof fetch });
    await client.uploadPdfResumable({
      name: 'large.pdf', bytes: new Uint8Array(6),
      session: { uploadUrl: 'https://upload.test/session', offset: 4, totalBytes: 6, mimeType: 'application/pdf', name: 'large.pdf' },
      options: { chunkSize: 4 },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries the same idempotent chunk after a network loss', async () => {
    let chunkAttempts = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('uploadType=resumable')) {
        return new Response(null, { headers: { Location: 'https://upload.test/session' } });
      }
      if (new Headers(init?.headers).get('Content-Range') === 'bytes */4') {
        return new Response(null, { status: 308 });
      }
      chunkAttempts += 1;
      if (chunkAttempts === 1) throw new TypeError('network unavailable');
      return Response.json({ id: 'file', name: 'large.pdf', mimeType: 'application/pdf' });
    });
    const client = new GoogleDriveClient({ getAccessToken: async () => 'token', fetchImpl: fetchImpl as typeof fetch });
    await expect(client.uploadPdfResumable({
      name: 'large.pdf', bytes: new Uint8Array(4),
      options: { retryDelayMs: () => 0 },
    })).resolves.toMatchObject({ id: 'file' });
    expect(chunkAttempts).toBe(2);
  });

  it('paginates changes and includes shared-drive deletion, rename, and update scope', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get('driveId')).toBe('shared');
      expect(url.searchParams.get('supportsAllDrives')).toBe('true');
      if (url.searchParams.get('pageToken') === 'cursor') {
        return Response.json({ changes: [{ fileId: 'deleted', removed: true }], nextPageToken: 'page-2' });
      }
      return Response.json({
        changes: [
          { fileId: 'renamed', file: { id: 'renamed', name: 'new.pdf', mimeType: 'application/pdf' } },
          { fileId: 'updated', file: { id: 'updated', name: 'x.pdf', mimeType: 'application/pdf', version: '2' } },
        ],
        newStartPageToken: 'fresh',
      });
    });
    const client = new GoogleDriveClient({ getAccessToken: async () => 'token', fetchImpl: fetchImpl as typeof fetch });
    const result = await client.listAllChanges('cursor', { driveId: 'shared' });
    expect(result.newStartPageToken).toBe('fresh');
    expect(result.changes.map((change) => change.fileId)).toEqual(['deleted', 'renamed', 'updated']);
  });
});

describe('Drive appData metadata', () => {
  it('persists immutable operation files, manifest, and cursor', async () => {
    const files = new Map<string, { file: DriveFile; bytes: Uint8Array }>();
    let nextId = 1;
    const fakeClient = {
      listAllAppDataFiles: async (name?: string) => [...files.values()].map((value) => value.file).filter((file) => !name || file.name === name),
      download: async (id: string) => [...files.values()].find((value) => value.file.id === id)?.bytes ?? new Uint8Array(),
      uploadAppData: async (name: string, bytes: Uint8Array, existingFileId?: string) => {
        const file = { id: existingFileId ?? String(nextId++), name, mimeType: 'application/json' };
        files.set(name, { file, bytes });
        return file;
      },
    } as unknown as GoogleDriveClient;
    const repository = new DriveAppDataRepository(fakeClient);
    const bundle = { schemaVersion: 1, deviceId: 'phone', operations: [{ id: 'one' }], createdAt: '2026-01-01T00:00:00.000Z' };
    const desktopBundle = { schemaVersion: 1, deviceId: 'desktop', operations: [{ id: 'two' }], createdAt: '2026-01-02T00:00:00.000Z' };
    const first = await repository.appendOperations(bundle);
    const duplicate = await repository.appendOperations(bundle);
    await repository.appendOperations(desktopBundle);
    expect(duplicate).toEqual(first);
    expect(await repository.readOperations()).toEqual([bundle, desktopBundle]);
    await repository.setCursor('google-drive', 'cursor-2');
    expect(await repository.getCursor('google-drive')).toBe('cursor-2');
  });
});

describe('Drive changes scheduling', () => {
  it('checkpoints only after applying all changes and coalesces lifecycle runs', async () => {
    let cursor = 'old';
    const client = {
      listAllChanges: vi.fn(async () => ({ changes: [{ fileId: 'a', removed: true }], newStartPageToken: 'new' })),
    } as unknown as GoogleDriveClient;
    const apply = vi.fn(async () => undefined);
    const synchronizer = new DriveChangesSynchronizer(
      client,
      { get: async () => cursor, set: async (value) => { cursor = value; } },
      apply,
    );
    const [foreground, background] = await Promise.all([
      synchronizer.onForeground(), synchronizer.runBackground(),
    ]);
    expect(foreground).toEqual(background);
    expect(client.listAllChanges).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledOnce();
    expect(cursor).toBe('new');
  });

  it('does not advance the durable cursor when applying a change fails', async () => {
    let cursor = 'old';
    const client = {
      listAllChanges: async () => ({ changes: [{ fileId: 'a' }], newStartPageToken: 'new' }),
    } as unknown as GoogleDriveClient;
    const synchronizer = new DriveChangesSynchronizer(
      client,
      { get: async () => cursor, set: async (value) => { cursor = value; } },
      async () => { throw new Error('local transaction failed'); },
    );
    await expect(synchronizer.sync()).rejects.toThrow('local transaction failed');
    expect(cursor).toBe('old');
  });
});
