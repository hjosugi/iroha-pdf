import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import type { StoreCaptureScenario } from './store-capture';

const STORE_CAPTURE_ENABLED = process.env.EXPO_PUBLIC_STORE_SCREENSHOTS === '1';

export function markStoreCaptureReady(scenario: StoreCaptureScenario): void {
  if (!STORE_CAPTURE_ENABLED || Platform.OS !== 'ios') return;
  const marker = new File(Paths.document, 'iroha-store-ready.txt');
  marker.create({ overwrite: true, intermediates: true });
  marker.write(scenario);
}
