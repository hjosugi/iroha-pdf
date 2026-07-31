/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Neither module loads off a device. Between them they do one thing the tests care
// about — hand back the bytes of a file — so they stand in as a counted, failable
// read of the font that is really committed to the repository.
let reads = 0;
let nextReadFails: Error | undefined;

vi.mock('expo-asset', () => ({
  Asset: {
    fromModule: (asset: { assetPath: string }) => ({
      localUri: asset.assetPath,
      uri: asset.assetPath,
      downloadAsync: async () => {
        if (nextReadFails) {
          const error = nextReadFails;
          nextReadFails = undefined;
          throw error;
        }
      },
    }),
  },
}));

vi.mock('expo-file-system', () => ({
  File: class {
    constructor(private readonly uri: string) {}

    bytes(): Uint8Array {
      reads += 1;
      return new Uint8Array(readFileSync(this.uri));
    }
  },
}));

/** A cold start, which is the scope the cache is meant to cover. */
async function relaunch(): Promise<typeof import('./annotation-font')> {
  vi.resetModules();
  reads = 0;
  nextReadFails = undefined;
  return import('./annotation-font');
}

let annotationFont: typeof import('./annotation-font');

beforeEach(async () => {
  annotationFont = await relaunch();
});

describe('loadAnnotationFont', () => {
  it('returns the OpenType face that ships with the app', async () => {
    const bytes = await annotationFont.loadAnnotationFont();
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('OTTO');
    expect(bytes.byteLength).toBeGreaterThan(1_000_000);
  });

  it('reads the several megabytes once per launch, not once per export', async () => {
    const first = await annotationFont.loadAnnotationFont();
    const second = await annotationFont.loadAnnotationFont();
    expect(reads).toBe(1);
    expect(second).toBe(first);
  });

  it('reads once even when export and print ask at the same moment', async () => {
    await Promise.all([
      annotationFont.loadAnnotationFont(),
      annotationFont.loadAnnotationFont(),
      annotationFont.loadAnnotationFont(),
    ]);
    expect(reads).toBe(1);
  });

  it('does not cache a failure, so one bad read does not disable text export', async () => {
    nextReadFails = new Error('asset download failed');
    await expect(annotationFont.loadAnnotationFont()).rejects.toThrow('asset download failed');
    expect(reads).toBe(0);

    const bytes = await annotationFont.loadAnnotationFont();
    expect(reads).toBe(1);
    expect(bytes.byteLength).toBeGreaterThan(1_000_000);
  });

  it('reports the failure to every caller waiting on that read', async () => {
    nextReadFails = new Error('asset download failed');
    const [first, second] = await Promise.allSettled([
      annotationFont.loadAnnotationFont(),
      annotationFont.loadAnnotationFont(),
    ]);
    expect(first?.status).toBe('rejected');
    expect(second?.status).toBe('rejected');
    await expect(annotationFont.loadAnnotationFont()).resolves.toBeInstanceOf(Uint8Array);
  });
});
