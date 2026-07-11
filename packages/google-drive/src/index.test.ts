import { describe, expect, it, vi } from 'vitest';

import { GoogleDriveClient } from './index';

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
});
