export const STORE_CAPTURE_SCENARIOS = ['library', 'viewer', 'tools', 'drive'] as const;

export type StoreCaptureScenario = (typeof STORE_CAPTURE_SCENARIOS)[number];

export function parseStoreCaptureScenario(value: unknown): StoreCaptureScenario | null {
  return typeof value === 'string' && STORE_CAPTURE_SCENARIOS.includes(value as StoreCaptureScenario)
    ? value as StoreCaptureScenario
    : null;
}
