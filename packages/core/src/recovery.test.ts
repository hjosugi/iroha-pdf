import { describe, expect, it } from 'vitest';

import { decideJournalRecovery } from './recovery';

describe('write-ahead journal recovery', () => {
  it('recognizes a write committed before a process kill', () => {
    expect(decideJournalRecovery('old', 'new', 'new')).toEqual({
      status: 'applied',
      recoveryCopy: null,
    });
  });

  it('offers the attempted value when the last valid state survived', () => {
    expect(decideJournalRecovery('old', 'new', 'old')).toEqual({
      status: 'rolled-back',
      recoveryCopy: 'new',
    });
  });

  it('does not overwrite a newer divergent state', () => {
    expect(decideJournalRecovery('old', 'attempted', 'newer')).toEqual({
      status: 'diverged',
      recoveryCopy: 'attempted',
    });
  });
});
