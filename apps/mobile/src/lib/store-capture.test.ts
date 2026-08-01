import { describe, expect, it } from 'vitest';

import { parseStoreCaptureScenario } from './store-capture';

describe('parseStoreCaptureScenario', () => {
  it.each(['library', 'viewer', 'tools', 'drive'] as const)('accepts %s', (scenario) => {
    expect(parseStoreCaptureScenario(scenario)).toBe(scenario);
  });

  it.each([undefined, null, '', 'settings', 1])('rejects %j', (value) => {
    expect(parseStoreCaptureScenario(value)).toBeNull();
  });
});
