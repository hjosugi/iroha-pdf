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
    const token = await this.getAccessToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);

    const response = await this.fetchImpl(url, { ...init, headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Google Drive request failed (${response.status}): ${body.slice(0, 500)}`);
    }
    return response;
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

  async listAppDataFiles(name?: string): Promise<DriveFileList> {
    const params = new URLSearchParams({
      fields: 'files(id,name,mimeType,modifiedTime,size,md5Checksum,version)',
      pageSize: '100',
      spaces: 'appDataFolder',
    });
    if (name) {
      const safeName = name.replaceAll("'", "\\'");
      params.set('q', `name='${safeName}' and trashed=false`);
    }

    const response = await this.request(`${DRIVE_API}/files?${params.toString()}`);
    return response.json() as Promise<DriveFileList>;
  }

  async download(fileId: string): Promise<Uint8Array> {
    const response = await this.request(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`);
    return new Uint8Array(await response.arrayBuffer());
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
    return this.resumableUpload({
      bytes,
      existingFileId,
      metadata: { name, mimeType: 'application/pdf' },
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
  }): Promise<DriveFile> {
    const idPath = input.existingFileId ? `/${encodeURIComponent(input.existingFileId)}` : '';
    const response = await this.request(
      `${DRIVE_UPLOAD_API}/files${idPath}?uploadType=resumable&fields=id,name,mimeType,modifiedTime,size,md5Checksum,version`,
      {
        method: input.existingFileId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Length': String(input.bytes.byteLength),
          'X-Upload-Content-Type': String(input.metadata.mimeType ?? 'application/octet-stream'),
        },
        body: JSON.stringify(input.metadata),
      },
    );
    const location = response.headers.get('Location');
    if (!location) throw new Error('Google Drive did not return a resumable upload URL');

    const uploadResponse = await this.request(location, {
      method: 'PUT',
      headers: {
        'Content-Length': String(input.bytes.byteLength),
        'Content-Type': String(input.metadata.mimeType ?? 'application/octet-stream'),
      },
      body: input.bytes as BodyInit,
    });
    return uploadResponse.json() as Promise<DriveFile>;
  }

  async getStartPageToken(): Promise<string> {
    const response = await this.request(`${DRIVE_API}/changes/startPageToken`);
    const data = (await response.json()) as { startPageToken: string };
    return data.startPageToken;
  }

  async listChanges(pageToken: string): Promise<unknown> {
    const params = new URLSearchParams({
      fields:
        'changes(fileId,removed,file(id,name,mimeType,modifiedTime,size,md5Checksum,version)),newStartPageToken,nextPageToken',
      pageToken,
      spaces: 'drive',
    });
    const response = await this.request(`${DRIVE_API}/changes?${params.toString()}`);
    return response.json();
  }
}
