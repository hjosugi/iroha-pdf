import { Diagnostics, type DiagnosticsStorage } from '@iroha-pdf/core';

/**
 * The desktop store for the opt-in diagnostics log (#66).
 *
 * `localStorage` can be disabled or full, and a diagnostics write is never worth
 * taking the workspace down for, so each operation swallows its own failure. A
 * refused write only means the event is not recorded.
 */
const storage: DiagnosticsStorage = {
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage disabled or full; see above.
    }
  },
  remove: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage disabled; nothing to remove.
    }
  },
};

export const diagnostics = new Diagnostics(storage);
