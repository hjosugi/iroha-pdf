import { afterEach, describe, expect, it } from 'vitest';

import { diagnostics } from './diagnostics';

afterEach(() => {
  diagnostics.clear();
  diagnostics.setEnabled(false);
});

describe('desktop diagnostics adapter', () => {
  it('records nothing until it is enabled, then exports and deletes', () => {
    expect(diagnostics.isEnabled()).toBe(false);
    diagnostics.record('app.started');
    expect(diagnostics.events()).toEqual([]);

    diagnostics.setEnabled(true);
    diagnostics.record('app.engine.failed', 'error');

    const parsed = JSON.parse(diagnostics.export());
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0].code).toBe('app.engine.failed');

    diagnostics.clear();
    expect(diagnostics.events()).toEqual([]);
  });

  it('previews only failures, and never any content', () => {
    diagnostics.setEnabled(true);
    diagnostics.record('app.started');
    diagnostics.record('document.open.failed', 'error');

    const preview = diagnostics.crashReportPreview();
    expect(preview).toContain('document.open.failed');
    expect(preview).not.toContain('app.started');
  });
});
