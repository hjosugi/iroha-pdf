export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.appdata',
] as const;

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  md5Checksum?: string;
  version?: string;
};

export type DriveFileList = {
  files: DriveFile[];
  nextPageToken?: string;
};

export type DriveRevision = {
  id: string;
  modifiedTime?: string;
  md5Checksum?: string;
  size?: string;
};

export type DownloadProgress = { loaded: number; total?: number };

export interface DriveOfflineCache {
  put(file: DriveFile, bytes: Uint8Array): Promise<void>;
}

export type DriveChange = {
  fileId: string;
  removed?: boolean;
  file?: DriveFile & { trashed?: boolean };
};

export type DriveChangePage = {
  changes: DriveChange[];
  nextPageToken?: string;
  newStartPageToken?: string;
};

export type DriveChangesOptions = {
  driveId?: string;
  includeItemsFromAllDrives?: boolean;
  supportsAllDrives?: boolean;
};

export type ResumableUploadSession = {
  uploadUrl: string;
  offset: number;
  totalBytes: number;
  mimeType: string;
  name: string;
  existingFileId?: string;
};

export type ResumableUploadOptions = {
  chunkSize?: number;
  maxRetries?: number;
  retryDelayMs?: (attempt: number) => number;
  signal?: AbortSignal;
  onProgress?: (progress: DownloadProgress) => void;
  onSession?: (session: ResumableUploadSession) => void;
};

export type AccessTokenProvider = () => Promise<string>;

export type DriveClientOptions = {
  getAccessToken: AccessTokenProvider;
  fetchImpl?: typeof fetch;
};

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export class GoogleDriveClient {
  private readonly getAccessToken: AccessTokenProvider;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DriveClientOptions) {
    this.getAccessToken = options.getAccessToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.authorizedFetch(url, init);
    if (!response.ok) await this.throwResponseError(response);
    return response;
  }

  private async authorizedFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getAccessToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return this.fetchImpl(url, { ...init, headers });
  }

  private async throwResponseError(response: Response): Promise<never> {
    const body = await response.text();
    throw new Error(`Google Drive request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  async listPdfFiles(pageToken?: string): Promise<DriveFileList> {
    const params = new URLSearchParams({
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size,md5Checksum,version)',
      orderBy: 'modifiedTime desc',
      pageSize: '100',
      q: "mimeType='application/pdf' and trashed=false",
      spaces: 'drive',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const response = await this.request(`${DRIVE_API}/files?${params.toString()}`);
    return response.json() as Promise<DriveFileList>;
  }

  async listAllPdfFiles(): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.listPdfFiles(pageToken);
      files.push(...page.files);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return files;
  }

  async listAppDataFiles(name?: string, pageToken?: string): Promise<DriveFileList> {
    const params = new URLSearchParams({
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size,md5Checksum,version)',
      pageSize: '100',
      spaces: 'appDataFolder',
    });
    if (name) {
      const safeName = name.replaceAll("'", "\\'");
      params.set('q', `name='${safeName}' and trashed=false`);
    }
    if (pageToken) params.set('pageToken', pageToken);

    const response = await this.request(`${DRIVE_API}/files?${params.toString()}`);
    return response.json() as Promise<DriveFileList>;
  }

  async listAllAppDataFiles(name?: string): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.listAppDataFiles(name, pageToken);
      files.push(...page.files);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return files;
  }

  async download(fileId: string): Promise<Uint8Array> {
    const response = await this.request(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async downloadToCache(
    fileId: string,
    cache: DriveOfflineCache,
    options: { signal?: AbortSignal; onProgress?: (progress: DownloadProgress) => void } = {},
  ): Promise<DriveFile> {
    const file = await this.getMetadata(fileId);
    const response = await this.request(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`,
      { signal: options.signal },
    );
    const totalHeader = response.headers.get('Content-Length');
    const total = totalHeader ? Number(totalHeader) : undefined;
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    if (reader) {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        chunks.push(result.value);
        loaded += result.value.byteLength;
        options.onProgress?.({ loaded, total });
      }
    } else {
      const bytes = new Uint8Array(await response.arrayBuffer());
      chunks.push(bytes);
      loaded = bytes.byteLength;
      options.onProgress?.({ loaded, total });
    }
    const bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    await cache.put(file, bytes);
    return file;
  }

  async getMetadata(fileId: string): Promise<DriveFile> {
    const fields = 'id,name,mimeType,modifiedTime,size,md5Checksum,version';
    const response = await this.request(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}`,
    );
    return response.json() as Promise<DriveFile>;
  }

  async uploadPdf(
    name: string,
    bytes: Uint8Array,
    existingFileId?: string,
  ): Promise<DriveFile> {
    return this.uploadPdfResumable({
      bytes,
      existingFileId,
      name,
    });
  }

  async uploadPdfResumable(input: {
    name: string;
    bytes: Uint8Array;
    existingFileId?: string;
    options?: ResumableUploadOptions;
    session?: ResumableUploadSession;
  }): Promise<DriveFile> {
    return this.resumableUpload({
      bytes: input.bytes,
      existingFileId: input.existingFileId,
      metadata: { name: input.name, mimeType: 'application/pdf' },
      options: input.options,
      session: input.session,
    });
  }

  async uploadAppData(
    name: string,
    bytes: Uint8Array,
    existingFileId?: string,
  ): Promise<DriveFile> {
    return this.resumableUpload({
      bytes,
      existingFileId,
      metadata: {
        name,
        mimeType: 'application/json',
        ...(existingFileId ? {} : { parents: ['appDataFolder'] }),
      },
    });
  }

  private async resumableUpload(input: {
    bytes: Uint8Array;
    existingFileId?: string;
    metadata: Record<string, unknown>;
    options?: ResumableUploadOptions;
    session?: ResumableUploadSession;
  }): Promise<DriveFile> {
    const mimeType = String(input.metadata.mimeType ?? 'application/octet-stream');
    let session = input.session;
    const isResuming = Boolean(session);
    if (!session) {
      const idPath = input.existingFileId ? `/${encodeURIComponent(input.existingFileId)}` : '';
      const response = await this.request(
        `${DRIVE_UPLOAD_API}/files${idPath}?uploadType=resumable&fields=id,name,mimeType,modifiedTime,size,md5Checksum,version`,
        {
          method: input.existingFileId ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Length': String(input.bytes.byteLength),
            'X-Upload-Content-Type': mimeType,
          },
          body: JSON.stringify(input.metadata),
          signal: input.options?.signal,
        },
      );
      const location = response.headers.get('Location');
      if (!location) throw new Error('Google Drive did not return a resumable upload URL');
      session = {
        uploadUrl: location,
        offset: 0,
        totalBytes: input.bytes.byteLength,
        mimeType,
        name: String(input.metadata.name ?? ''),
        existingFileId: input.existingFileId,
      };
      input.options?.onSession?.({ ...session });
    } else if (session.totalBytes !== input.bytes.byteLength) {
      throw new Error('Resumable upload byte length does not match the saved session');
    }

    const chunkSize = input.options?.chunkSize ?? 8 * 1024 * 1024;
    if (!Number.isInteger(chunkSize) || chunkSize <= 0) throw new Error('chunkSize must be positive');
    const maxRetries = input.options?.maxRetries ?? 4;
    if (isResuming) {
      const status = await this.queryResumableUpload(session, input.options?.signal);
      if (status.file) return status.file;
      session.offset = status.offset;
      input.options?.onProgress?.({ loaded: session.offset, total: session.totalBytes });
      input.options?.onSession?.({ ...session });
    }
    if (chunkSize < input.bytes.byteLength - session.offset && chunkSize % (256 * 1024) !== 0) {
      throw new Error('Non-final Google Drive upload chunks must be multiples of 256 KiB');
    }
    while (session.offset < input.bytes.byteLength) {
      const start = session.offset;
      const endExclusive = Math.min(start + chunkSize, input.bytes.byteLength);
      const chunk = input.bytes.slice(start, endExclusive);
      let attempt = 0;
      while (true) {
        let response: Response;
        try {
          response = await this.authorizedFetch(session.uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Length': String(chunk.byteLength),
              'Content-Type': session.mimeType,
              'Content-Range': `bytes ${start}-${endExclusive - 1}/${input.bytes.byteLength}`,
            },
            body: chunk as BodyInit,
            signal: input.options?.signal,
          });
        } catch (error) {
          if (input.options?.signal?.aborted || attempt >= maxRetries) throw error;
          attempt += 1;
          await delay(input.options?.retryDelayMs?.(attempt) ?? retryDelay(attempt), input.options?.signal);
          try {
            const status = await this.queryResumableUpload(session, input.options?.signal);
            if (status.file) return status.file;
            session.offset = status.offset;
            input.options?.onProgress?.({ loaded: session.offset, total: session.totalBytes });
            input.options?.onSession?.({ ...session });
            break;
          } catch {
            // A transient status-query failure is retried by resending the same
            // idempotent byte range; Drive will report its accepted Range.
          }
          continue;
        }
        if (response.status === 308) {
          const uploaded = parseUploadedOffset(response.headers.get('Range')) ?? endExclusive;
          session.offset = Math.max(session.offset, uploaded);
          input.options?.onProgress?.({ loaded: session.offset, total: session.totalBytes });
          input.options?.onSession?.({ ...session });
          break;
        }
        if (response.ok) {
          session.offset = session.totalBytes;
          input.options?.onProgress?.({ loaded: session.offset, total: session.totalBytes });
          input.options?.onSession?.({ ...session });
          return response.json() as Promise<DriveFile>;
        }
        if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
          attempt += 1;
          await delay(input.options?.retryDelayMs?.(attempt) ?? retryDelay(attempt), input.options?.signal);
          try {
            const status = await this.queryResumableUpload(session, input.options?.signal);
            if (status.file) return status.file;
            session.offset = status.offset;
            input.options?.onProgress?.({ loaded: session.offset, total: session.totalBytes });
            input.options?.onSession?.({ ...session });
            break;
          } catch {
            // Retry the chunk when even the status probe is transiently unavailable.
          }
          continue;
        }
        await this.throwResponseError(response);
      }
    }
    throw new Error('Resumable upload completed without file metadata');
  }

  private async queryResumableUpload(
    session: ResumableUploadSession,
    signal?: AbortSignal,
  ): Promise<{ offset: number; file?: DriveFile }> {
    const response = await this.authorizedFetch(session.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': '0',
        'Content-Range': `bytes */${session.totalBytes}`,
      },
      signal,
    });
    if (response.status === 308) {
      return { offset: parseUploadedOffset(response.headers.get('Range')) ?? 0 };
    }
    if (response.ok) return { offset: session.totalBytes, file: await response.json() as DriveFile };
    return this.throwResponseError(response);
  }

  async listRevisions(fileId: string): Promise<DriveRevision[]> {
    const params = new URLSearchParams({ fields: 'revisions(id,modifiedTime,md5Checksum,size)', pageSize: '1000' });
    const response = await this.request(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}/revisions?${params.toString()}`,
    );
    const data = (await response.json()) as { revisions?: DriveRevision[] };
    return data.revisions ?? [];
  }

  async getLatestRevision(fileId: string): Promise<DriveRevision | undefined> {
    return (await this.listRevisions(fileId)).at(-1);
  }

  async getStartPageToken(options: DriveChangesOptions = {}): Promise<string> {
    const params = new URLSearchParams();
    if (options.driveId) params.set('driveId', options.driveId);
    if (options.supportsAllDrives ?? Boolean(options.driveId)) params.set('supportsAllDrives', 'true');
    const suffix = params.size ? `?${params.toString()}` : '';
    const response = await this.request(`${DRIVE_API}/changes/startPageToken${suffix}`);
    const data = (await response.json()) as { startPageToken: string };
    return data.startPageToken;
  }

  async listChanges(pageToken: string, options: DriveChangesOptions = {}): Promise<DriveChangePage> {
    const params = new URLSearchParams({
      fields:
        'changes(fileId,removed,file(id,name,mimeType,modifiedTime,size,md5Checksum,version,trashed)),newStartPageToken,nextPageToken',
      pageToken,
      spaces: 'drive',
    });
    for (const [key, value] of sharedDriveParams(options)) params.set(key, value);
    const response = await this.request(`${DRIVE_API}/changes?${params.toString()}`);
    return response.json() as Promise<DriveChangePage>;
  }

  async listAllChanges(
    pageToken: string,
    options: DriveChangesOptions = {},
  ): Promise<{ changes: DriveChange[]; newStartPageToken: string }> {
    const changes: DriveChange[] = [];
    let token = pageToken;
    const visited = new Set<string>();
    while (true) {
      if (visited.has(token)) throw new Error('Google Drive returned a repeated changes page token');
      visited.add(token);
      const page = await this.listChanges(token, options);
      changes.push(...page.changes);
      if (page.nextPageToken) {
        token = page.nextPageToken;
        continue;
      }
      if (!page.newStartPageToken) throw new Error('Changes response did not include a new start page token');
      return { changes, newStartPageToken: page.newStartPageToken };
    }
  }
}

export type AppDataOperationBundle = {
  schemaVersion: number;
  deviceId: string;
  operations: unknown[];
  createdAt: string;
};

export type AppDataOperationFile = {
  name: string;
  fileId: string;
  createdAt: string;
  deviceId: string;
};

export type AppDataManifest = {
  schemaVersion: 1;
  operationFiles: AppDataOperationFile[];
  cursors: Record<string, string>;
  updatedAt: string;
};

const APP_DATA_MANIFEST = 'iroha-manifest.json';

/** Manifest-based operation log in appDataFolder. Files are immutable and the
 * small manifest is the only mutable object, making interrupted sync recovery
 * straightforward. */
export class DriveAppDataRepository {
  constructor(private readonly client: GoogleDriveClient) {}

  async readJson<T>(name: string): Promise<{ file: DriveFile; value: T } | undefined> {
    const file = (await this.client.listAllAppDataFiles(name))[0];
    if (!file) return undefined;
    const bytes = await this.client.download(file.id);
    return { file, value: JSON.parse(new TextDecoder().decode(bytes)) as T };
  }

  async writeJson(name: string, value: unknown, existingFileId?: string): Promise<DriveFile> {
    return this.client.uploadAppData(
      name,
      new TextEncoder().encode(JSON.stringify(value)),
      existingFileId,
    );
  }

  async loadManifest(): Promise<{ fileId?: string; manifest: AppDataManifest }> {
    const stored = await this.readJson<AppDataManifest>(APP_DATA_MANIFEST);
    return stored
      ? { fileId: stored.file.id, manifest: stored.value }
      : {
          manifest: {
            schemaVersion: 1,
            operationFiles: [],
            cursors: {},
            updatedAt: new Date(0).toISOString(),
          },
        };
  }

  private async saveManifest(manifest: AppDataManifest, fileId?: string): Promise<void> {
    await this.writeJson(APP_DATA_MANIFEST, manifest, fileId);
  }

  async appendOperations(bundle: AppDataOperationBundle): Promise<AppDataOperationFile> {
    const loaded = await this.loadManifest();
    const safeCreatedAt = bundle.createdAt.replaceAll(':', '-');
    const name = `operations-${safeCreatedAt}-${bundle.deviceId}.json`;
    const existing = loaded.manifest.operationFiles.find((entry) => entry.name === name);
    if (existing) return existing;
    const file = await this.writeJson(name, bundle);
    const operationFile: AppDataOperationFile = {
      name,
      fileId: file.id,
      createdAt: bundle.createdAt,
      deviceId: bundle.deviceId,
    };
    loaded.manifest.operationFiles.push(operationFile);
    loaded.manifest.operationFiles.sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.name.localeCompare(right.name));
    loaded.manifest.updatedAt = new Date().toISOString();
    await this.saveManifest(loaded.manifest, loaded.fileId);
    return operationFile;
  }

  async readOperations(after?: string): Promise<AppDataOperationBundle[]> {
    const { manifest } = await this.loadManifest();
    const bundles: AppDataOperationBundle[] = [];
    for (const entry of manifest.operationFiles) {
      if (after && entry.createdAt <= after) continue;
      const bytes = await this.client.download(entry.fileId);
      bundles.push(JSON.parse(new TextDecoder().decode(bytes)) as AppDataOperationBundle);
    }
    return bundles;
  }

  async getCursor(provider: string): Promise<string | undefined> {
    return (await this.loadManifest()).manifest.cursors[provider];
  }

  async setCursor(provider: string, token: string): Promise<void> {
    const loaded = await this.loadManifest();
    loaded.manifest.cursors[provider] = token;
    loaded.manifest.updatedAt = new Date().toISOString();
    await this.saveManifest(loaded.manifest, loaded.fileId);
  }
}

export interface DriveChangesCursorStore {
  get(): Promise<string | undefined>;
  set(token: string): Promise<void>;
}

export class DriveAppDataChangesCursorStore implements DriveChangesCursorStore {
  constructor(
    private readonly repository: DriveAppDataRepository,
    private readonly provider = 'google-drive-changes',
  ) {}

  get(): Promise<string | undefined> {
    return this.repository.getCursor(this.provider);
  }

  set(token: string): Promise<void> {
    return this.repository.setCursor(this.provider, token);
  }
}

export type DriveChangesSynchronizerOptions = {
  changes?: DriveChangesOptions;
  intervalMs?: number;
};

/** Runs the entire pagination chain as one checkpoint. The cursor advances
 * only after the consumer successfully applies every page. */
export class DriveChangesSynchronizer {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<DriveChange[]> | undefined;

  constructor(
    private readonly client: GoogleDriveClient,
    private readonly cursor: DriveChangesCursorStore,
    private readonly apply: (changes: DriveChange[]) => Promise<void>,
    private readonly options: DriveChangesSynchronizerOptions = {},
  ) {}

  async sync(): Promise<DriveChange[]> {
    if (this.running) return this.running;
    this.running = this.syncOnce();
    try {
      return await this.running;
    } finally {
      this.running = undefined;
    }
  }

  private async syncOnce(): Promise<DriveChange[]> {
    let token = await this.cursor.get();
    if (!token) {
      token = await this.client.getStartPageToken(this.options.changes);
      await this.cursor.set(token);
      return [];
    }
    const result = await this.client.listAllChanges(token, this.options.changes);
    await this.apply(result.changes);
    await this.cursor.set(result.newStartPageToken);
    return result.changes;
  }

  /** Foreground hook for mobile/desktop lifecycle handlers. */
  onForeground(): Promise<DriveChange[]> {
    return this.sync();
  }

  /** Entry point suitable for an OS background task. */
  runBackground(): Promise<DriveChange[]> {
    return this.sync();
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.sync(); }, this.options.intervalMs ?? 60_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}

function sharedDriveParams(options: DriveChangesOptions): URLSearchParams {
  const params = new URLSearchParams();
  if (options.driveId) params.set('driveId', options.driveId);
  if (options.includeItemsFromAllDrives ?? Boolean(options.driveId)) {
    params.set('includeItemsFromAllDrives', 'true');
  }
  if (options.supportsAllDrives ?? Boolean(options.driveId)) params.set('supportsAllDrives', 'true');
  return params;
}

function parseUploadedOffset(range: string | null): number | undefined {
  const match = range?.match(/bytes=0-(\d+)/);
  return match?.[1] ? Number(match[1]) + 1 : undefined;
}

function retryDelay(attempt: number): number {
  return Math.min(2 ** (attempt - 1) * 250, 4_000);
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}
