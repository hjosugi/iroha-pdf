/**
 * End-to-end against the real Tauri application.
 *
 * Everything in ../e2e runs in Chromium against a stubbed Tauri runtime. That covers
 * the application logic well, but production ships a WebKitGTK webview talking to a
 * real Rust backend, and neither had ever executed this code. This script closes that
 * gap: a real binary, a real webview, real files on disk.
 *
 * Two things it deliberately does not test, because they cannot be scripted here:
 *   - the native file dialog (a portal window under Wayland; no driver available)
 *   - the dialog's scope grant, which is emulated by IROHA_E2E_SCOPE
 * Scope *denial* is tested, which is the half that matters for safety.
 *
 * Usage: npm run e2e:tauri
 *
 * Needs a debug binary (`task build:desktop:debug`), `tauri-driver`, a WebKitWebDriver,
 * and a display — `xvfb-run -a` is enough, which is what CI gives it. The Vite dev
 * server the debug binary loads and the fixture it opens are started and built here if
 * they are not already there, so nothing else has to be arranged around it.
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureComplexPdf } from './fixture.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const WORK = '/tmp/iroha-real-e2e';
const DRIVER_PORT = 4444;
const DEV_PORT = 1420;
// Where `task build:desktop:debug` leaves it, unless a CARGO_TARGET_DIR points cargo
// somewhere else — the second candidate is the shared target directory a developer
// here uses. IROHA_APP overrides both.
const APP_CANDIDATES = [
  join(here, '../src-tauri/target/debug/iroha-pdf'),
  join(process.env.HOME ?? '', '.cache/cargo-target/debug/iroha-pdf'),
];
const APP =
  process.env.IROHA_APP ?? APP_CANDIDATES.find((path) => existsSync(path)) ?? APP_CANDIDATES[0];
// A debug build loads `build.devUrl`, so the webview is served by Vite, not by an
// embedded `frontendDist`. `import.meta.env.DEV` — the seam this opens files through —
// is only true there.
const DEV_URL = `http://localhost:${DEV_PORT}/`;
// `cargo install tauri-driver` puts it in Cargo's bin directory, which is on an
// interactive shell's PATH but not necessarily on this process's. Prefer the explicit
// path, fall back to PATH, so a driver installed some other way still works.
const CARGO_DRIVER = join(process.env.HOME ?? '', '.cargo/bin/tauri-driver');
const DRIVER =
  process.env.TAURI_DRIVER ?? (existsSync(CARGO_DRIVER) ? CARGO_DRIVER : 'tauri-driver');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

let failures = 0;
function check(label, condition, detail = '') {
  const mark = condition ? 'PASS' : 'FAIL';
  if (!condition) failures += 1;
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
}

async function wd(method, path, body) {
  const response = await fetch(`http://localhost:${DRIVER_PORT}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Whether something is already serving the app on the dev port. */
async function devServerAnswers() {
  try {
    const response = await fetch(DEV_URL, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Starts Vite if it is not already running, and returns the process to stop, or null
 * when someone else's server is answering — a developer with `npm run dev` open keeps
 * it, and CI gets one it does not have to manage from the workflow.
 *
 * Detached so the kill reaches the whole group: npm spawns Vite as a child, and
 * signalling only npm would leave the port held.
 */
async function startDevServer() {
  if (await devServerAnswers()) {
    console.log(`dev server: already answering on ${DEV_URL}`);
    return null;
  }
  const server = spawn('npm', ['run', 'dev'], {
    cwd: join(here, '..'),
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true,
  });
  server.stderr.on('data', (chunk) => console.log(`  (vite) ${String(chunk).trim()}`));
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) throw new Error('the dev server exited before it served');
    if (await devServerAnswers()) {
      console.log(`dev server: started on ${DEV_URL}`);
      return server;
    }
    await sleep(1000);
  }
  // Nothing else holds this one yet, so it has to be stopped here or it outlives the run.
  stopDevServer(server);
  throw new Error(`the dev server did not answer on ${DEV_URL} within 120s`);
}

function stopDevServer(server) {
  if (!server?.pid) return;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
}

async function main() {
  if (!existsSync(APP)) {
    throw new Error(
      `app binary not found: ${APP}\n` +
        'Build it with: task build:desktop:debug\n' +
        'It has to be a debug build: the scope grant this drives is #[cfg(debug_assertions)].',
    );
  }
  const fixture = await ensureComplexPdf();

  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  const target = join(WORK, 'complex.pdf');
  copyFileSync(fixture, target);
  const originalHash = sha(target);
  const originalSize = statSync(target).size;
  console.log(`fixture: ${target} (${originalSize} bytes, sha ${originalHash.slice(0, 12)})`);

  const devServer = await startDevServer();

  // The app inherits the driver's environment, which is how IROHA_E2E_SCOPE reaches it.
  const driver = spawn(DRIVER, ['--port', String(DRIVER_PORT)], {
    env: {
      ...process.env,
      DISPLAY: process.env.DISPLAY ?? ':0',
      IROHA_E2E_SCOPE: WORK,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  driver.on('error', (error) => {
    console.error(
      `\ncould not start ${DRIVER}: ${error.message}\n` +
        'Install it with: cargo install tauri-driver --version 2.0.6 --locked\n' +
        'It also needs a WebKitWebDriver on PATH (Debian/Ubuntu: webkit2gtk-driver).',
    );
    stopDevServer(devServer);
    process.exit(2);
  });
  driver.stdout.on('data', (chunk) => {
    const line = String(chunk).trim();
    if (line.includes('iroha-pdf:')) console.log(`  (app) ${line}`);
  });
  driver.stderr.on('data', (chunk) => {
    const line = String(chunk).trim();
    if (line.includes('iroha-pdf:')) console.log(`  (app) ${line}`);
  });
  await sleep(2500);

  let sessionId;
  try {
    const session = await wd('POST', '/session', {
      capabilities: {
        alwaysMatch: {
          'tauri:options': {
            application: APP,
            // The dialog cannot be scripted, so open by path instead.
            env: { IROHA_E2E_SCOPE: WORK },
          },
        },
      },
    });
    sessionId = session?.value?.sessionId;
    if (!sessionId) throw new Error(`no session: ${JSON.stringify(session).slice(0, 400)}`);
    await sleep(4500);

    const sync = async (script) => {
      const result = await wd('POST', `/session/${sessionId}/execute/sync`, { script, args: [] });
      return result?.value;
    };
    const invoke = async (cmd, args, options) => {
      const result = await wd('POST', `/session/${sessionId}/execute/async`, {
        script: `
          const done = arguments[arguments.length - 1];
          const t = setTimeout(() => done(JSON.stringify({ ok:false, error:'timeout' })), 15000);
          window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)},
            ${JSON.stringify(options ?? null)} || undefined)
            .then(v => { clearTimeout(t); done(JSON.stringify({ ok:true, len: v && v.length })); })
            .catch(e => { clearTimeout(t); done(JSON.stringify({ ok:false, error:String(e && e.message || e) })); });
        `,
        args: [],
      });
      try {
        return JSON.parse(result?.value ?? '{}');
      } catch {
        return { ok: false, error: 'unparseable' };
      }
    };

    console.log('\nthe app starts in a real WebKitGTK webview');
    const boot = JSON.parse(
      await sync(`return JSON.stringify({
        internals: typeof window.__TAURI_INTERNALS__ === 'object',
        title: document.title,
        devHook: typeof window.__IROHA_DEV__ === 'object',
        buttons: [...document.querySelectorAll('button')].map(b => b.textContent.trim()),
      })`),
    );
    check('Tauri internals present', boot.internals === true);
    check('window title', boot.title === 'Iroha PDF', boot.title);
    check('app shell rendered', boot.buttons.includes('Open PDF'), boot.buttons.join('|'));
    check('dev open hook available', boot.devHook === true);

    console.log('\nthe capability denies paths the user never picked');
    for (const path of ['/etc/passwd', '/etc/hostname']) {
      const result = await invoke('plugin:fs|read_file', { path });
      check(`read ${path} denied`, result.ok === false && /forbidden path/.test(result.error ?? ''));
    }
    const pwn = await invoke('plugin:fs|write_file', [1, 2, 3], {
      headers: { path: encodeURIComponent('/etc/iroha-pwned'), options: '{}' },
    });
    check('write outside scope denied', pwn.ok === false);
    const removed = await invoke('plugin:fs|remove', { path: target });
    check('fs.remove not granted at all', removed.ok === false && /not allowed/.test(removed.error ?? ''));

    console.log('\nthe granted path is readable, and pdfium renders it under WebKit');
    const granted = await invoke('plugin:fs|read_file', { path: target });
    check('granted path readable', granted.ok === true, `${granted.len ?? granted.error} bytes`);

    await sync(`window.__IROHA_DEV__.openPath(${JSON.stringify(target)}); return 'opening'`);
    let opened = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await sleep(1000);
      opened = JSON.parse(
        await sync(`return JSON.stringify({
          toolbar: !!document.querySelector('.pdf-toolbar'),
          pages: document.querySelectorAll('.pdf-viewport img').length,
          path: document.querySelector('.side-panel-path')?.textContent ?? null,
        })`),
      );
      if (opened.toolbar && opened.pages > 0) break;
    }
    check('toolbar appeared', opened?.toolbar === true);
    check('pdfium rendered pages in WebKit', (opened?.pages ?? 0) > 0, `${opened?.pages} images`);
    check('the real path is retained', opened?.path === target, String(opened?.path));

    console.log('\nannotating and saving writes the real file');
    await sync(`
      const shape = [...document.querySelectorAll('.pdf-toolbar button')]
        .find(b => b.textContent.trim() === 'Shape');
      shape.click();
      return 'armed';
    `);
    const rect = JSON.parse(
      await sync(`
        const img = document.querySelector('.pdf-viewport img');
        const r = img.getBoundingClientRect();
        return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height });
      `),
    );
    await wd('POST', `/session/${sessionId}/actions`, {
      actions: [
        {
          type: 'pointer',
          id: 'mouse',
          parameters: { pointerType: 'mouse' },
          actions: [
            { type: 'pointerMove', duration: 0, x: Math.round(rect.x + rect.w * 0.2), y: Math.round(rect.y + rect.h * 0.25) },
            { type: 'pointerDown', button: 0 },
            { type: 'pointerMove', duration: 150, x: Math.round(rect.x + rect.w * 0.45), y: Math.round(rect.y + rect.h * 0.35) },
            { type: 'pointerMove', duration: 150, x: Math.round(rect.x + rect.w * 0.65), y: Math.round(rect.y + rect.h * 0.45) },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ],
    });
    await sleep(1500);

    const saveLabel = await sync(`return [...document.querySelectorAll('.primary-button')].pop().textContent`);
    check('an unsaved edit is reported', /Save \(\d+\)/.test(saveLabel ?? ''), saveLabel);

    await sync(`[...document.querySelectorAll('.primary-button')].pop().click(); return 'saving'`);
    let saveState = null;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      await sleep(1000);
      saveState = await sync(`return document.querySelector('.save-state')?.textContent ?? null`);
      if (saveState && !/Saving/.test(saveState)) break;
    }
    check('the app reports a save', /^Saved to/.test(saveState ?? ''), String(saveState));

    console.log('\nwhat actually landed on disk');
    const newHash = sha(target);
    const newSize = statSync(target).size;
    check('the target file changed', newHash !== originalHash, `${originalSize} -> ${newSize} bytes`);

    const backup = join(WORK, 'complex.iroha-original.pdf');
    check('a backup was created', existsSync(backup));
    if (existsSync(backup)) {
      check('the backup is the pristine original', sha(backup) === originalHash);
    }

    // Prove the saved bytes are a real PDF carrying the annotation.
    const header = readFileSync(target).subarray(0, 5).toString('latin1');
    check('output is a PDF', header === '%PDF-', header);

    const { PDFArray, PDFDict, PDFDocument, PDFName } = await import('pdf-lib');
    const saved = await PDFDocument.load(new Uint8Array(readFileSync(target)), {
      throwOnInvalidObject: false,
    });
    const subtypes = saved.getPages().flatMap((page) => {
      const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
      if (!annots) return [];
      return Array.from({ length: annots.size() }, (_, index) => {
        const subtype = annots.lookupMaybe(index, PDFDict)?.get(PDFName.of('Subtype'));
        return subtype instanceof PDFName ? subtype.asString() : null;
      }).filter(Boolean);
    });
    check('the annotation is in the file on disk', subtypes.length > 0, subtypes.join(',') || 'none');
    check('page count unchanged', saved.getPageCount() === 2, String(saved.getPageCount()));
    try {
      const text = execFileSync('pdftotext', [target, '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      check('CJK body text survived', text.includes('四半期報告書'));
      check('table cell text survived', text.includes('売上高'));
    } catch {
      console.log('  [SKIP] pdftotext unavailable');
    }
  } finally {
    if (sessionId) await wd('DELETE', `/session/${sessionId}`).catch(() => {});
    driver.kill('SIGTERM');
    stopDevServer(devServer);
  }

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nharness error:', error.message);
  process.exit(2);
});
