import { useEffect, useRef, useState } from 'react';

import { t } from './i18n';
import type { LayoutChoice, LayoutSheet } from './layout-operations';

type Mode = 'two-up' | 'four-up' | 'booklet' | 'poster';

/**
 * The desktop layout dialog (#23): pages per sheet, a booklet, or poster tiles.
 *
 * The result is always a new file. Printing it is a separate step, and this dialog
 * says so instead of implying it sent something to a printer.
 */
export function LayoutDialog({
  open,
  documentName,
  onClose,
  onApply,
}: {
  open: boolean;
  documentName: string;
  onClose: () => void;
  onApply: (choice: LayoutChoice, options: { print: boolean }) => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>('two-up');
  const [sheet, setSheet] = useState<LayoutSheet>('a4');
  const [columns, setColumns] = useState(2);
  const [rows, setRows] = useState(2);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [busy, onClose, open]);

  if (!open) return null;

  const submit = async (print: boolean) => {
    const choice: LayoutChoice =
      mode === 'poster'
        ? { kind: 'poster', columns, rows }
        : mode === 'booklet'
          ? { kind: 'booklet', sheet }
          : { kind: 'n-up', perSheet: mode === 'two-up' ? 2 : 4, sheet };

    setBusy(true);
    try {
      await onApply(choice, { print });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={() => !busy && onClose()}>
      <section
        ref={dialogRef}
        className="print-dialog layout-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="layout-dialog-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="layout-dialog-title">{t('layout.dialogTitle')}</h2>
        <p className="dialog-hint">{documentName}</p>
        <p className="dialog-hint">{t('layout.hint')}</p>

        <fieldset>
          <legend>{t('layout.mode')}</legend>
          {(
            [
              ['two-up', 'layout.twoUp'],
              ['four-up', 'layout.fourUp'],
              ['booklet', 'layout.booklet'],
              ['poster', 'layout.poster'],
            ] as const
          ).map(([id, labelKey]) => (
            <label key={id}>
              <input
                type="radio"
                checked={mode === id}
                onChange={() => setMode(id)}
                disabled={busy}
              />
              {t(labelKey)}
            </label>
          ))}
        </fieldset>

        {mode === 'poster' ? (
          <div className="layout-grid">
            <label>
              {t('layout.columns')}
              <input
                type="number"
                min={1}
                max={8}
                value={columns}
                disabled={busy}
                onChange={(event) => setColumns(Number(event.target.value))}
              />
            </label>
            <label>
              {t('layout.rows')}
              <input
                type="number"
                min={1}
                max={8}
                value={rows}
                disabled={busy}
                onChange={(event) => setRows(Number(event.target.value))}
              />
            </label>
          </div>
        ) : (
          <label className="layout-sheet">
            {t('layout.sheet')}
            <select
              value={sheet}
              disabled={busy}
              onChange={(event) => setSheet(event.target.value as LayoutSheet)}
            >
              <option value="a4">{t('layout.a4')}</option>
              <option value="letter">{t('layout.letter')}</option>
            </select>
          </label>
        )}

        <div className="dialog-actions">
          <button className="tool" onClick={onClose} disabled={busy}>
            {t('action.cancel')}
          </button>
          <button
            className="tool"
            onClick={() => void submit(false)}
            disabled={busy || (mode === 'poster' && (columns < 1 || rows < 1))}
          >
            {t('layout.create')}
          </button>
          <button
            className="primary-button"
            onClick={() => void submit(true)}
            disabled={busy || (mode === 'poster' && (columns < 1 || rows < 1))}
          >
            {t('layout.createAndPrint')}
          </button>
        </div>
      </section>
    </div>
  );
}
