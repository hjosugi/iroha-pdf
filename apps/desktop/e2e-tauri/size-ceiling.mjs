/**
 * How large a PDF can the real application actually open?
 *
 * The Chromium harness answers this with a Playwright route holding the whole file in
 * the browser process, so a crash there could easily be the harness rather than the
 * app. Here the bytes come off a real disk through the real fs plugin into a real
 * WebKitGTK webview, which is the only configuration whose answer means anything.
 *
 * Usage: node e2e-tauri/size-ceiling.mjs   (needs a vite dev server on 1420)
 */
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, '../e2e/fixtures');
const WORK = '/tmp/iroha-size-ceiling';
const DRIVER_PORT = 4444;
const APP =
  process.env.IROHA_APP ?? join(process.env.HOME ?? '', '.cache/cargo-target/debug/iroha-pdf');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

// Built by `npx playwright test memory-probe -g "how large"`, which writes them here.
const CANDIDATES = ['scan-12.pdf', 'scan-24.pdf', 'scan-36.pdf', 'scan-48.pdf', 'scan-72.pdf'];

async function main() {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });

  const files = [];
  for (const name of CANDIDATES) {
    const source = join(FIXTURES, name);
    if (!existsSync(source)) continue;
    const target = join(WORK, name);
    copyFileSync(source, target);
    files.push({ name, path: target, sizeMb: statSync(target).size / 1024 / 1024 });
  }
  files.sort((a, b) => a.sizeMb - b.sizeMb);
  if (files.length === 0) throw new Error(`no fixtures found in ${FIXTURES}`);

  console.log('testing:', files.map((f) => `${f.name} (${f.sizeMb.toFixed(1)} MB)`).join(', '));

  const driver = spawn(join(process.env.HOME ?? '', '.cargo/bin/tauri-driver'), [
    '--port',
    String(DRIVER_PORT),
  ], {
    env: { ...process.env, DISPLAY: process.env.DISPLAY ?? ':0', IROHA_E2E_SCOPE: WORK },
    stdio: 'ignore',
  });
  await sleep(2500);

  try {
    for (const file of files) {
      // A fresh session per file, so one failure cannot colour the next.
      const session = await wd('POST', '/session', {
        capabilities: { alwaysMatch: { 'tauri:options': { application: APP } } },
      });
      const id = session?.value?.sessionId;
      if (!id) {
        console.log(`[real] ${file.name}: could not start a session`);
        continue;
      }
      await sleep(4500);
      await wd('POST', `/session/${id}/timeouts`, { script: 180_000 });

      const started = Date.now();
      const result = await wd('POST', `/session/${id}/execute/async`, {
        script: `
          const done = arguments[arguments.length - 1];
          const t = setTimeout(() => done(JSON.stringify({ ok:false, why:'timeout after 150s' })), 150000);
          window.__IROHA_DEV__.openPath(${JSON.stringify(file.path)})
            .then(async () => {
              // openPath resolves once the engine accepts the buffer; rendering the
              // first page is what the user actually waits for.
              const deadline = Date.now() + 120000;
              let pages = 0;
              while (Date.now() < deadline) {
                pages = document.querySelectorAll('.pdf-viewport img').length;
                if (pages > 0) break;
                await new Promise((r) => setTimeout(r, 250));
              }
              clearTimeout(t);
              done(JSON.stringify({ ok: pages > 0, pages, why: pages ? '' : 'nothing rendered' }));
            })
            .catch((e) => { clearTimeout(t); done(JSON.stringify({ ok:false, why:String(e && e.message || e) })); });
        `,
        args: [],
      });
      const elapsed = Date.now() - started;

      let verdict;
      try {
        verdict = JSON.parse(result?.value ?? '{}');
      } catch {
        verdict = { ok: false, why: 'webview stopped responding' };
      }
      if (result?.value === undefined && result?.value?.error) {
        verdict = { ok: false, why: 'session lost (renderer likely killed)' };
      }

      console.log(
        `[real] ${file.name.padEnd(18)} ${file.sizeMb.toFixed(1).padStart(7)} MB  ` +
          `${String(elapsed).padStart(7)} ms  ` +
          (verdict.ok ? `opened, ${verdict.pages} page images` : `FAILED: ${verdict.why}`),
      );

      await wd('DELETE', `/session/${id}`).catch(() => {});
      await sleep(1000);
    }
  } finally {
    driver.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error('harness error:', error.message);
  process.exit(2);
});
