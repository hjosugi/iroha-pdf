/**
 * A note is only worth as much as the label under it is honest. The editor said
 * "Autosaved locally" whether or not anything had reached storage, which #149
 * fixed and nothing could check until now.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Note } from '@iroha-pdf/core';

import { setRouteParams } from '../../../test-route';

const getNote = vi.fn<() => Promise<Note | null>>();
const saveNote = vi.fn<(note: Note) => Promise<void>>();

vi.mock('@/lib/database', () => ({
  getNote: () => getNote(),
  saveNote: (note: Note) => saveNote(note),
}));

const alertFailure = vi.fn();
vi.mock('@/lib/alerts', () => ({
  alertFailure: (...args: unknown[]) => alertFailure(...args),
}));

const { default: NoteEditorScreen } = await import('./[id]');

const NOTE: Note = {
  id: 'note-1',
  title: 'Lease',
  body: 'first draft',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  getNote.mockReset().mockResolvedValue(NOTE);
  saveNote.mockReset().mockResolvedValue(undefined);
  alertFailure.mockReset();
  setRouteParams({ id: 'note-1' });
});

/**
 * Types into the body and lets the 250 ms debounce elapse.
 *
 * Through `fireEvent.change` rather than by assigning `value`: React installs its
 * own value setter on the element, so a direct assignment updates the DOM and
 * never reaches the component — which is a test that types nothing and asserts
 * against the initial render.
 */
async function type(text: string): Promise<void> {
  const body = await screen.findByLabelText('Note body');
  fireEvent.change(body, { target: { value: text } });
  await new Promise((resolve) => setTimeout(resolve, 350));
}

describe('the note editor', () => {
  it('shows the note it was asked for', async () => {
    render(<NoteEditorScreen />);
    expect(await screen.findByDisplayValue('first draft')).toBeTruthy();
  });

  it('says it autosaved once the write has landed', async () => {
    render(<NoteEditorScreen />);
    await type('second draft');

    await waitFor(() => expect(saveNote).toHaveBeenCalled());
    // Named explicitly: "Autosaved locally" is also the initial text, so an
    // assertion on it alone passes for a test that typed nothing.
    expect(saveNote.mock.calls.at(-1)?.[0].body).toBe('second draft');
    expect(screen.getByText('Autosaved locally')).toBeTruthy();
  });

  /**
   * The regression #149 fixed. A refused write left the label saying the note was
   * safe, which is the reassurance someone reads before closing the screen.
   */
  it('stops claiming it autosaved when the write was refused', async () => {
    saveNote.mockRejectedValue(new Error('database or disk is full'));
    render(<NoteEditorScreen />);
    await type('second draft');

    expect(await screen.findByText('Note could not be saved')).toBeTruthy();
    expect(screen.queryByText('Autosaved locally')).toBeNull();
    await waitFor(() => expect(alertFailure).toHaveBeenCalled());
  });

  it('says so again once a later write lands', async () => {
    saveNote.mockRejectedValueOnce(new Error('database or disk is full'));
    render(<NoteEditorScreen />);
    await type('second draft');
    expect(await screen.findByText('Note could not be saved')).toBeTruthy();

    await type('third draft');
    expect(await screen.findByText('Autosaved locally')).toBeTruthy();
  });
});
