/**
 * An in-page stand-in for the Tauri runtime.
 *
 * The desktop save path — dialog picks a path, fs reads it, fs writes bytes back,
 * copy_file takes the one-time original backup — only runs when
 * `window.__TAURI_INTERNALS__` exists. Rather than leave that path untested until
 * someone runs the packaged app by hand, this reimplements the same invoke protocol
 * over an in-memory filesystem, so the tests exercise the real application code and
 * can then inspect exactly what would have hit disk.
 *
 * The command names and argument shapes mirror @tauri-apps/plugin-fs and
 * @tauri-apps/plugin-dialog. In particular `plugin:fs|write_file` passes the bytes
 * as the invoke payload and the path through `options.headers.path`, URI-encoded.
 */
import type { Page } from '@playwright/test';

export type StubOptions = {
  /** Absolute path -> base64 contents, seeded into the virtual filesystem. */
  files: Record<string, string>;
  /**
   * Absolute path -> URL fetched on first read. Large fixtures go here: embedding
   * a 40 MB PDF as base64 in an init script is far slower than letting the page
   * fetch it from the test server.
   */
  fileUrls?: Record<string, string>;
  /** Path the open dialog returns; null simulates the user cancelling. */
  openPath: string | null;
  /** Path the save dialog returns; null simulates the user cancelling. */
  savePath: string | null;
  /**
   * How the user answers a confirmation (`ask`). 'ok' presses the affirmative button,
   * 'cancel' backs out. Defaults to 'cancel' so a test never destroys data by accident.
   */
  confirmAnswer?: 'ok' | 'cancel';
};

export type InvokeRecord = { cmd: string; path?: string; byteLength?: number };

declare global {
  interface Window {
    /** Injected by Tauri at runtime; declared here so the stub can install one. */
    __TAURI_INTERNALS__: {
      invoke: (cmd: string, args?: unknown, options?: unknown) => Promise<unknown>;
      transformCallback: (callback: unknown, once?: boolean) => unknown;
      convertFileSrc: (path: string, protocol?: string) => string;
    };
    __IROHA_TEST__: {
      listFiles: () => string[];
      readFileBase64: (path: string) => string | null;
      calls: () => InvokeRecord[];
      setSavePath: (path: string | null) => void;
      setOpenPath: (path: string | null) => void;
      /** What a multi-select open dialog returns. Null means the user dismissed it. */
      setOpenPaths: (paths: string[] | null) => void;
      /**
       * Paths for the next save dialogs, consumed one per dialog. An operation
       * that saves twice — split — shows two dialogs and the user names each
       * separately, so a single `savePath` would model them overwriting one
       * another rather than what really happens.
       */
      setSavePaths: (paths: (string | null)[]) => void;
      /**
       * Makes writes to `path` run out of room. Null gives the disk back.
       *
       * Faithful to the failure it stands for: a real write empties its target before
       * it starts, so the file is left at zero bytes and only then does the call fail.
       * That is precisely why a save must not write straight into the document.
       */
      setDiskFull: (path: string | null) => void;
      /** Refuses to rename onto this path, the way an open handle does on Windows. */
      setRenameBlocked: (path: string | null) => void;
    };
  }
}

export async function installTauriStub(page: Page, options: StubOptions): Promise<void> {
  await page.addInitScript((stub: StubOptions) => {
    const decode = (base64: string): Uint8Array => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    };

    const encode = (bytes: Uint8Array): string => {
      let binary = '';
      // Chunked to stay clear of the argument-count limit on large PDFs.
      const chunk = 0x8000;
      for (let index = 0; index < bytes.length; index += chunk) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
      }
      return btoa(binary);
    };

    const files = new Map<string, Uint8Array>();
    for (const [path, base64] of Object.entries(stub.files)) {
      files.set(path, decode(base64));
    }

    const lazy = new Map(Object.entries(stub.fileUrls ?? {}));
    const load = async (path: string): Promise<Uint8Array | undefined> => {
      const cached = files.get(path);
      if (cached) return cached;
      const url = lazy.get(path);
      if (!url) return undefined;
      const response = await fetch(url);
      const bytes = new Uint8Array(await response.arrayBuffer());
      files.set(path, bytes);
      return bytes;
    };

    const calls: InvokeRecord[] = [];
    let openPath = stub.openPath;
    let openPaths: string[] | null = null;
    const queuedSavePaths: (string | null)[] = [];
    let savePath = stub.savePath;
    let fullDiskPath: string | null = null;
    let renameBlockedPath: string | null = null;

    const toBytes = (payload: unknown): Uint8Array => {
      if (payload instanceof Uint8Array) return payload;
      if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
      if (Array.isArray(payload)) return Uint8Array.from(payload as number[]);
      throw new Error('write_file payload was not binary');
    };

    window.__IROHA_TEST__ = {
      listFiles: () => [...files.keys()].sort(),
      readFileBase64: (path) => {
        const bytes = files.get(path);
        return bytes ? encode(bytes) : null;
      },
      calls: () => calls,
      setSavePath: (path) => {
        savePath = path;
      },
      setOpenPath: (path) => {
        openPath = path;
      },
      setOpenPaths: (paths) => {
        openPaths = paths;
      },
      setSavePaths: (paths) => {
        queuedSavePaths.length = 0;
        queuedSavePaths.push(...paths);
      },
      setDiskFull: (path) => {
        fullDiskPath = path;
      },
      setRenameBlocked: (path) => {
        renameBlockedPath = path;
      },
    };

    window.__TAURI_INTERNALS__ = {
      transformCallback: (callback: unknown) => callback,
      convertFileSrc: (path: string) => path,
      invoke: async (cmd: string, args: unknown, invokeOptions?: unknown) => {
        const record: InvokeRecord = { cmd };

        switch (cmd) {
          case 'plugin:dialog|open': {
            calls.push(record);
            // The real plugin returns an array when asked for several, and a
            // single path otherwise; a stub that always returned one would let a
            // multi-select caller pass here and fail on a device.
            const options = (args as { options?: { multiple?: boolean } } | undefined)?.options;
            if (options?.multiple) return openPaths;
            return openPath;
          }
          case 'plugin:dialog|save': {
            calls.push(record);
            if (queuedSavePaths.length > 0) return queuedSavePaths.shift() ?? null;
            return savePath;
          }
          case 'plugin:dialog|message': {
            // `ask` compares the returned label against the ok label it sent, so the
            // stub answers with whichever button the test wants pressed.
            calls.push(record);
            const buttons = (args as { buttons?: unknown }).buttons;
            const custom =
              buttons && typeof buttons === 'object' && 'OkCancelCustom' in buttons
                ? (buttons as { OkCancelCustom: [string, string] }).OkCancelCustom
                : null;
            const [ok, cancel] = custom ?? ['Yes', 'No'];
            return stub.confirmAnswer === 'ok' ? ok : cancel;
          }
          case 'plugin:fs|read_file': {
            const path = (args as { path: string }).path;
            const bytes = await load(path);
            record.path = path;
            record.byteLength = bytes?.length;
            calls.push(record);
            if (!bytes) throw new Error(`ENOENT: ${path}`);
            // Verified against the real runtime: Tauri's IPC hands back an ArrayBuffer.
            // Returning a number[] here instead costs ~8 bytes per byte of file and
            // made a 42 MB PDF look like it needed 350 MB of heap — an artefact of the
            // harness, not the app. Slicing would likewise double the peak on large
            // files, so hand the buffer over untouched whenever it is already exact.
            const exact =
              bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
            return exact
              ? (bytes.buffer as ArrayBuffer)
              : (bytes.buffer.slice(
                  bytes.byteOffset,
                  bytes.byteOffset + bytes.byteLength,
                ) as ArrayBuffer);
          }
          case 'plugin:fs|write_file': {
            const headers = (invokeOptions as { headers?: Record<string, string> })?.headers;
            const raw = headers?.path;
            if (!raw) throw new Error('write_file called without a path header');
            const path = decodeURIComponent(raw);
            const bytes = toBytes(args);
            if (path === fullDiskPath) {
              files.set(path, new Uint8Array());
              record.path = path;
              record.byteLength = 0;
              calls.push(record);
              throw new Error(`failed to write to ${path}: No space left on device (os error 28)`);
            }
            files.set(path, bytes);
            record.path = path;
            record.byteLength = bytes.length;
            calls.push(record);
            return null;
          }
          case 'plugin:fs|rename': {
            const { oldPath, newPath } = args as { oldPath: string; newPath: string };
            const bytes = files.get(oldPath);
            record.path = newPath;
            record.byteLength = bytes?.length;
            calls.push(record);
            // Windows refuses to replace a file another process holds open, which is
            // what a PDF viewer looking at the same document does.
            if (newPath === renameBlockedPath) {
              throw new Error(`failed to rename to ${newPath}: Access is denied. (os error 5)`);
            }
            if (!bytes) throw new Error(`ENOENT: ${oldPath}`);
            files.set(newPath, bytes);
            files.delete(oldPath);
            return null;
          }
          case 'allow_derived_file': {
            // The Rust command only widens the filesystem scope, which the stub does
            // not model; what matters here is that the app asks before it writes.
            record.path = (args as { derived: string }).derived;
            calls.push(record);
            return null;
          }
          case 'discard_part_file': {
            // Derived on the Rust side from the source alone, so the stub derives it
            // the same way rather than taking a path it was handed.
            const source = (args as { source: string }).source;
            const part = source.replace(/\.pdf$/i, '') + '.iroha-part.pdf';
            record.path = part;
            calls.push(record);
            return files.delete(part);
          }
          case 'plugin:fs|exists': {
            const path = (args as { path: string }).path;
            record.path = path;
            calls.push(record);
            return files.has(path) || lazy.has(path);
          }
          case 'plugin:fs|copy_file': {
            const { fromPath, toPath } = args as { fromPath: string; toPath: string };
            const source = await load(fromPath);
            if (!source) throw new Error(`ENOENT: ${fromPath}`);
            files.set(toPath, source.slice());
            record.path = toPath;
            record.byteLength = source.length;
            calls.push(record);
            return null;
          }
          default:
            calls.push(record);
            return null;
        }
      },
    } as never;
  }, options);
}

/** Reads a file back out of the page's virtual filesystem. */
export async function readVirtualFile(page: Page, path: string): Promise<Buffer | null> {
  const base64 = await page.evaluate(
    (target) => window.__IROHA_TEST__.readFileBase64(target),
    path,
  );
  return base64 === null ? null : Buffer.from(base64, 'base64');
}

export async function listVirtualFiles(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__IROHA_TEST__.listFiles());
}

export async function invokeCalls(page: Page): Promise<InvokeRecord[]> {
  return page.evaluate(() => window.__IROHA_TEST__.calls());
}
