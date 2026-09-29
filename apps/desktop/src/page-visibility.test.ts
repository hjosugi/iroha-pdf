import { describe, expect, it, vi } from 'vitest';

import { subscribeToVisibility, type VisibilitySource } from './page-visibility';

/** A document that only has the part this module reads, and a way to change it. */
function fakeDocument(initial: DocumentVisibilityState) {
  let state = initial;
  const listeners = new Set<() => void>();
  const source: VisibilitySource = {
    get visibilityState() {
      return state;
    },
    addEventListener: (_type, listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener);
    },
  };
  return {
    source,
    set(next: DocumentVisibilityState) {
      state = next;
      for (const listener of [...listeners]) listener();
    },
    get listening(): number {
      return listeners.size;
    },
  };
}

describe('subscribeToVisibility', () => {
  it('reports the current state as soon as it subscribes', () => {
    const { source } = fakeDocument('visible');
    const listener = vi.fn();

    subscribeToVisibility(listener, source);

    // Without this the state is only known at the first change, and a window that
    // opens hidden is never told it should have released anything.
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(true);
  });

  it('reports an already-hidden window as hidden', () => {
    const { source } = fakeDocument('hidden');
    const listener = vi.fn();

    subscribeToVisibility(listener, source);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(false);
  });

  it('reports each change, in both directions', () => {
    const { source, set } = fakeDocument('visible');
    const listener = vi.fn();
    subscribeToVisibility(listener, source);
    listener.mockClear();

    set('hidden');
    expect(listener).toHaveBeenLastCalledWith(false);

    set('visible');
    expect(listener).toHaveBeenLastCalledWith(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('stops reporting once unsubscribed, and stops listening', () => {
    const { source, set, listening } = fakeDocument('visible');
    const listener = vi.fn();
    const unsubscribe = subscribeToVisibility(listener, source);
    listener.mockClear();

    unsubscribe();
    set('hidden');

    expect(listener).not.toHaveBeenCalled();
    expect(listening, 'the change listener must not outlive the subscription').toBe(0);
  });
});
