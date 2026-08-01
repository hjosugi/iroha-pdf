import { Platform, Settings } from 'react-native';

import type { StoreCaptureScenario } from './store-capture';

const STORE_CAPTURE_ENABLED = process.env.EXPO_PUBLIC_STORE_SCREENSHOTS === '1';

export function markStoreCaptureReady(scenario: StoreCaptureScenario): void {
  if (!STORE_CAPTURE_ENABLED || Platform.OS !== 'ios') return;
  Settings.set({ IrohaStoreReady: scenario });
}
