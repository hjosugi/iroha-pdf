/**
 * The Recovery screen's one job is to say whether interrupted work survived, so
 * the case that matters most is the one where it could not find out. Saying
 * "nothing needs recovery" there is a reassurance nobody should act on, and it is
 * what this screen did before #146.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RecoveryCopy } from '@/lib/database';

const listRecoveryCopies = vi.fn<() => Promise<RecoveryCopy[]>>();
const restoreRecoveryCopy = vi.fn<(id: string) => Promise<void>>();
const discardRecoveryCopy = vi.fn<(id: string) => Promise<void>>();

vi.mock('@/lib/database', () => ({
  listRecoveryCopies: () => listRecoveryCopies(),
  restoreRecoveryCopy: (id: string) => restoreRecoveryCopy(id),
  discardRecoveryCopy: (id: string) => discardRecoveryCopy(id),
}));

const alertFailure = vi.fn();
vi.mock('@/lib/alerts', () => ({
  alertFailure: (...args: unknown[]) => alertFailure(...args),
  confirmDestructive: (options: { onConfirm: () => void }) => options.onConfirm(),
}));

const { default: RecoveryScreen } = await import('./recovery');

function copyFixture(overrides: Partial<RecoveryCopy> = {}): RecoveryCopy {
  return {
    journalId: 'journal-1',
    entityType: 'note',
    entityId: 'note-1',
    payload: {
      id: 'note-1', title: 'Lease', body: 'check clause 4',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
    },
    status: 'rolled-back',
    createdAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  listRecoveryCopies.mockReset();
  restoreRecoveryCopy.mockReset();
  discardRecoveryCopy.mockReset();
  alertFailure.mockReset();
});

describe('the Recovery screen', () => {
  it('offers an interrupted edit it found', async () => {
    listRecoveryCopies.mockResolvedValue([copyFixture()]);
    render(<RecoveryScreen />);

    expect(await screen.findByText('check clause 4')).toBeTruthy();
    expect(screen.queryByText(/復旧が必要な中断編集はありません|No interrupted edits/)).toBeNull();
  });

  it('says nothing needs recovery only when it actually looked', async () => {
    listRecoveryCopies.mockResolvedValue([]);
    render(<RecoveryScreen />);

    expect(await screen.findByText(/No interrupted edits need recovery/)).toBeTruthy();
  });

  /**
   * The regression #146 fixed. An unreadable list rendered as an empty one, so
   * the screen answered "there is nothing to recover" at the moment it had failed
   * to look — and the rejection went unhandled, which is silent in a release build.
   */
  it('does not claim there is nothing to recover when the read failed', async () => {
    listRecoveryCopies.mockRejectedValue(new Error('unable to open database file'));
    render(<RecoveryScreen />);

    expect(await screen.findByText(/could not be read/)).toBeTruthy();
    expect(screen.queryByText(/No interrupted edits need recovery/)).toBeNull();
    await waitFor(() => expect(alertFailure).toHaveBeenCalled());
  });

  it('offers a retry, and shows what the retry found', async () => {
    listRecoveryCopies.mockRejectedValueOnce(new Error('unable to open database file'));
    listRecoveryCopies.mockResolvedValueOnce([copyFixture()]);
    render(<RecoveryScreen />);

    const retry = await screen.findByRole('button', { name: 'Try again' });
    retry.click();

    expect(await screen.findByText('check clause 4')).toBeTruthy();
    expect(screen.queryByText(/could not be read/)).toBeNull();
  });
});
