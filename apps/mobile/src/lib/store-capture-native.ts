import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import type { StoreCaptureScenario } from './store-capture';
import { parseStoreCaptureScenario } from './store-capture';

const STORE_CAPTURE_ENABLED = process.env.EXPO_PUBLIC_STORE_SCREENSHOTS === '1';
const SCENARIO_FILE = 'iroha-store-scenario.txt';
const ROUTE_FILE = 'iroha-store-route.txt';
const READY_FILE = 'iroha-store-ready.txt';

export function readStoreCaptureScenario(): StoreCaptureScenario | null {
  if (!STORE_CAPTURE_ENABLED || Platform.OS !== 'ios') return null;
  const marker = new File(Paths.document, SCENARIO_FILE);
  return marker.exists ? parseStoreCaptureScenario(marker.textSync()) : null;
}

export function clearStoreCaptureScenario(): void {
  if (!STORE_CAPTURE_ENABLED || Platform.OS !== 'ios') return;
  const marker = new File(Paths.document, SCENARIO_FILE);
  if (marker.exists) marker.delete();
}

export function markStoreCaptureRoute(scenario: StoreCaptureScenario): void {
  if (!STORE_CAPTURE_ENABLED || Platform.OS !== 'ios') return;
  const marker = new File(Paths.document, ROUTE_FILE);
  marker.create({ overwrite: true, intermediates: true });
  marker.write(scenario);
}

export function markStoreCaptureReady(scenario: StoreCaptureScenario): void {
  if (!STORE_CAPTURE_ENABLED || Platform.OS !== 'ios') return;
  const marker = new File(Paths.document, READY_FILE);
  marker.create({ overwrite: true, intermediates: true });
  marker.write(scenario);
}
