import { useEffect, useRef, useState } from 'react';

import type { BlankPageCandidate } from './blank-pages-operation';
import { t } from './i18n';

/**
 * What the detector found, before anything is removed (#30).
 *
 * Every candidate starts selected because the detector only lists pages that paint
 * nothing — but the list is visible and each one can be unchecked, and the removal
 * writes a new file rather than the open document.
 */
export function BlankPagesDialog({
  candidates,
  documentName,
  onClose,
  onRemove,
}: {
  candidates: readonly BlankPageCandidate[];
  documentName: string;
  onClose: () => void;
  onRemove: (pageIndices: readonly number[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(candidates.map((candidate) => candidate.pageIndex)),
  );
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [busy, onClose]);

  const toggle = (pageIndex: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(pageIndex)) next.delete(pageIndex);
      else next.add(pageIndex);
      return next;
    });
  };

  const submit = async () => {
    setBusy(true);
    try {
      await onRemove([...selected].sort((a, b) => a - b));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={() => !busy && onClose()}>
      <section
        ref={dialogRef}
        className="print-dialog blank-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="blank-dialog-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="blank-dialog-title">{t('blank.dialogTitle')}</h2>
        <p className="dialog-hint">{documentName}</p>
        <p className="dialog-hint">{t('blank.hint')}</p>

        <fieldset>
          <legend>{t('blank.dialogTitle')}</legend>
          {candidates.map((candidate) => (
            <label key={candidate.pageIndex}>
              <input
                type="checkbox"
                checked={selected.has(candidate.pageIndex)}
                onChange={() => toggle(candidate.pageIndex)}
              />
              {t('blank.page', {
                page: candidate.pageIndex + 1,
                confidence: Math.round(candidate.confidence * 100),
              })}
            </label>
          ))}
        </fieldset>

        <div className="dialog-actions">
          <button className="tool" onClick={onClose} disabled={busy}>
            {t('action.cancel')}
          </button>
          <button
            className="primary-button"
            onClick={() => void submit()}
            disabled={busy || selected.size === 0}
          >
            {t('blank.remove', { count: selected.size })}
          </button>
        </div>
      </section>
    </div>
  );
}
