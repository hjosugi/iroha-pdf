import { Alert } from 'react-native';

import { userFacingErrorMessage } from '@iroha-pdf/core';
import { t } from './i18n';

/**
 * The two alert shapes every screen uses.
 *
 * They were written out at each call site, which made the wording of a failure
 * and the ordering of a destructive confirmation a per-screen decision rather
 * than a product one. Naming them keeps "what went wrong" and "are you sure"
 * consistent, and keeps the cancel button first and non-destructive everywhere.
 */
export function alertFailure(title: string, error: unknown): void {
  // A raw platform or provider rejection is classified and localized here rather
  // than shown as-is (#55); the app's own wording passes through unchanged.
  Alert.alert(title, userFacingErrorMessage(error, t));
}

export function confirmDestructive(options: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}): void {
  Alert.alert(options.title, options.message, [
    { text: t('action.cancel'), style: 'cancel' },
    { text: options.confirmLabel, style: 'destructive', onPress: options.onConfirm },
  ]);
}
