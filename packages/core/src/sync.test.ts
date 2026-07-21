import { describe, expect, it, vi } from 'vitest';

import { mergeAnnotationOperations } from './annotations';
import { DurableSyncQueue, type SyncQueueEntry, type SyncQueueStore } from './sync';
import type { SyncOperation } from './types';

const operation = (overrides: Partial<SyncOperation> = {}): SyncOperation => ({
  id: 'op-1', deviceId: 'phone', entityId: 'annotation-1', entityType: 'annotation',
  kind: 'upsert', logicalClock: 1, payload: { text: 'hello' }, ...overrides,
});

describe('annotation tombstone merge', () => {
  it('deterministically keeps delete on a concurrent edit/delete tie', () => {
    const edit = operation({ id: 'edit', deviceId: 'z-device' });
    const tombstone = operation({ id: 'delete', deviceId: 'a-device', kind: 'delete' });
    expect(mergeAnnotationOperations([edit], [tombstone])).toEqual([tombstone]);
    expect(mergeAnnotationOperations([tombstone], [edit])).toEqual([tombstone]);
  });

  it('deduplicates delivery and uses logical clocks rather than wall clocks', () => {
    const old = operation({ id: 'old', logicalClock: 8, payload: { updatedAt: '2099-01-01' } });
    const newer = operation({ id: 'new', logicalClock: 9, payload: { updatedAt: '2000-01-01' } });
    expect(mergeAnnotationOperations([old, newer], [newer])).toEqual([newer]);
  });

  it('is arrival-order independent even for a malformed duplicate id', () => {
    const left = operation({ payload: { text: 'a' } });
    const right = operation({ payload: { text: 'b' } });
    expect(mergeAnnotationOperations([left], [right])).toEqual(
      mergeAnnotationOperations([right], [left]),
    );
  });
});

describe('durable offline queue', () => {
  it('persists 100 operations, deduplicates keys, and drains exactly once', async () => {
    let persisted: SyncQueueEntry[] = [];
    const store: SyncQueueStore = {
      load: async () => structuredClone(persisted),
      save: async (entries) => { persisted = structuredClone(entries); },
    };
    const queue = new DurableSyncQueue(store, { now: () => 1_000 });
    for (let index = 0; index < 100; index += 1) {
      await queue.enqueue(operation({ id: `op-${index}`, entityId: `a-${index}` }));
    }
    await queue.enqueue(operation({ id: 'op-0' }));
    expect(persisted).toHaveLength(100);

    const send = vi.fn(async () => 'success' as const);
    expect(await queue.drain(send)).toEqual({ processed: 100, remaining: 0, authRequired: false });
    expect(send).toHaveBeenCalledTimes(100);

    const reloaded = new DurableSyncQueue(store);
    expect(await reloaded.list()).toEqual([]);
  });

  it('backs off with jitter, pauses for auth, and supports manual retry', async () => {
    let entries: SyncQueueEntry[] = [];
    let now = 10_000;
    const store: SyncQueueStore = {
      load: async () => structuredClone(entries),
      save: async (value) => { entries = structuredClone(value); },
    };
    const queue = new DurableSyncQueue(store, { now: () => now, random: () => 0, baseDelayMs: 1_000 });
    await queue.enqueue(operation());
    await queue.drain(async () => 'retry');
    expect(entries[0]).toMatchObject({ status: 'failed', attempts: 1, nextAttemptAt: 10_500 });
    now = 10_500;
    await queue.drain(async () => 'auth-required');
    expect(entries[0]?.status).toBe('auth-required');
    const sendWhilePaused = vi.fn(async () => 'success' as const);
    expect(await queue.drain(sendWhilePaused)).toMatchObject({ authRequired: true });
    expect(sendWhilePaused).not.toHaveBeenCalled();
    await queue.retry('op-1');
    expect(entries[0]).toMatchObject({ status: 'pending', nextAttemptAt: 10_500 });
  });
});
