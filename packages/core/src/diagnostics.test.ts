import { describe, expect, it } from 'vitest';

import {
  DIAGNOSTICS_EVENTS_KEY,
  DIAGNOSTICS_LIMIT,
  Diagnostics,
  type DiagnosticsStorage,
} from './diagnostics';

function memoryStorage(seed: Record<string, string> = {}): DiagnosticsStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    get: (key) => data.get(key) ?? null,
    set: (key, value) => void data.set(key, value),
    remove: (key) => void data.delete(key),
  };
}

const FIXED = new Date('2026-01-02T03:04:05.000Z');
const clock = () => FIXED;

describe('diagnostics opt-in', () => {
  it('records nothing at all until it is enabled', () => {
    const storage = memoryStorage();
    const diagnostics = new Diagnostics(storage, clock);

    expect(diagnostics.isEnabled()).toBe(false);
    diagnostics.record('document.open.failed', 'error');

    expect(diagnostics.events()).toEqual([]);
    expect(storage.data.has(DIAGNOSTICS_EVENTS_KEY)).toBe(false);
  });

  it('records once enabled, and stops again when disabled', () => {
    const diagnostics = new Diagnostics(memoryStorage(), clock);

    diagnostics.setEnabled(true);
    diagnostics.record('app.started');
    diagnostics.record('document.open.failed', 'error', { count: 2 });

    expect(diagnostics.isEnabled()).toBe(true);
    expect(diagnostics.events()).toHaveLength(2);

    diagnostics.setEnabled(false);
    diagnostics.record('app.started');
    expect(diagnostics.events()).toHaveLength(2);
  });

  it('carries only the allowed fields, never content', () => {
    const diagnostics = new Diagnostics(memoryStorage(), clock);
    diagnostics.setEnabled(true);
    diagnostics.record('document.save.failed', 'error', { durationMs: 12 });

    const [event] = diagnostics.events();
    expect(event).toEqual({
      at: FIXED.toISOString(),
      level: 'error',
      code: 'document.save.failed',
      durationMs: 12,
    });
    expect(Object.keys(event!).sort()).toEqual(['at', 'code', 'durationMs', 'level']);
  });
});

describe('diagnostics export and deletion', () => {
  it('exports a versioned document with the events', () => {
    const diagnostics = new Diagnostics(memoryStorage(), clock);
    diagnostics.setEnabled(true);
    diagnostics.record('app.started');

    const parsed = JSON.parse(diagnostics.export());
    expect(parsed.version).toBe(1);
    expect(parsed.generatedAt).toBe(FIXED.toISOString());
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0].code).toBe('app.started');
  });

  it('deletes everything it stored', () => {
    const storage = memoryStorage();
    const diagnostics = new Diagnostics(storage, clock);
    diagnostics.setEnabled(true);
    diagnostics.record('app.started');

    diagnostics.clear();
    expect(diagnostics.events()).toEqual([]);
    expect(storage.data.has(DIAGNOSTICS_EVENTS_KEY)).toBe(false);
  });

  it('keeps the newest events and drops the oldest past the limit', () => {
    const diagnostics = new Diagnostics(memoryStorage(), clock);
    diagnostics.setEnabled(true);
    for (let index = 0; index < DIAGNOSTICS_LIMIT + 5; index += 1) {
      diagnostics.record('app.started', 'info', { count: index });
    }

    const events = diagnostics.events();
    expect(events).toHaveLength(DIAGNOSTICS_LIMIT);
    expect(events.at(-1)?.count).toBe(DIAGNOSTICS_LIMIT + 4);
  });
});

describe('diagnostics storage is untrusted', () => {
  it('ignores unparseable storage', () => {
    const diagnostics = new Diagnostics(memoryStorage({ [DIAGNOSTICS_EVENTS_KEY]: 'not json' }), clock);
    expect(diagnostics.events()).toEqual([]);
  });

  it('drops events whose code or level is not one of ours', () => {
    const stored = JSON.stringify([
      { at: FIXED.toISOString(), level: 'error', code: 'document.open.failed' },
      { at: FIXED.toISOString(), level: 'error', code: '/home/me/secret.pdf' },
      { at: FIXED.toISOString(), level: 'verbose', code: 'app.started' },
      { at: FIXED.toISOString(), level: 'error', code: 'app.started', body: 'leaked' },
    ]);
    const diagnostics = new Diagnostics(memoryStorage({ [DIAGNOSTICS_EVENTS_KEY]: stored }), clock);

    expect(diagnostics.events()).toEqual([
      { at: FIXED.toISOString(), level: 'error', code: 'document.open.failed' },
    ]);
  });
});

describe('crash report preview', () => {
  it('is empty when nothing failed', () => {
    const diagnostics = new Diagnostics(memoryStorage(), clock);
    diagnostics.setEnabled(true);
    diagnostics.record('app.started');
    expect(diagnostics.crashReportPreview()).toBe('');
  });

  it('names the codes and times of the most recent failures', () => {
    const diagnostics = new Diagnostics(memoryStorage(), clock);
    diagnostics.setEnabled(true);
    diagnostics.record('document.open.failed', 'error');
    diagnostics.record('app.engine.failed', 'error');

    const preview = diagnostics.crashReportPreview();
    expect(preview).toContain('error document.open.failed');
    expect(preview).toContain('error app.engine.failed');
    expect(preview.split('\n')).toHaveLength(2);
  });
});
