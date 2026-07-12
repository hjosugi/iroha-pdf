export type JournalSnapshot = string | null;

export type RecoveryDecision =
  | { status: 'applied'; recoveryCopy: null }
  | { status: 'rolled-back'; recoveryCopy: string }
  | { status: 'diverged'; recoveryCopy: string };

/**
 * Reconciles an unfinished write-ahead journal entry after a process kill.
 * The current durable row always wins; the attempted value is retained as a
 * recovery copy whenever it did not become the durable value.
 */
export function decideJournalRecovery(
  previousSnapshot: JournalSnapshot,
  attemptedSnapshot: string,
  currentSnapshot: JournalSnapshot,
): RecoveryDecision {
  if (currentSnapshot === attemptedSnapshot) {
    return { status: 'applied', recoveryCopy: null };
  }
  if (currentSnapshot === previousSnapshot) {
    return { status: 'rolled-back', recoveryCopy: attemptedSnapshot };
  }
  return { status: 'diverged', recoveryCopy: attemptedSnapshot };
}

