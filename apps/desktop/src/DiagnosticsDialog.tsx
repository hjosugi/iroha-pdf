import { useEffect, useRef, useState } from 'react';

import { diagnostics } from './diagnostics';
import { t } from './i18n';

/**
 * The opt-in diagnostics dialog (#66). It is the only place the log can be turned
 * on, looked at, exported or deleted, so a user can see exactly what would leave
 * the device before it does.
 */
export function DiagnosticsDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const [enabled, setEnabled] = useState(() => diagnostics.isEnabled());
  const [count, setCount] = useState(() => diagnostics.events().length);
  const [preview, setPreview] = useState(() => diagnostics.crashReportPreview());

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const refresh = () => {
    setCount(diagnostics.events().length);
    setPreview(diagnostics.crashReportPreview());
  };

  const toggle = (next: boolean) => {
    diagnostics.setEnabled(next);
    setEnabled(next);
    refresh();
  };

  const exportLog = () => {
    const blob = new Blob([diagnostics.export()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'iroha-pdf-diagnostics.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const clear = () => {
    diagnostics.clear();
    refresh();
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="print-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="diagnostics-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="diagnostics-dialog-title">{t('diagnostics.title')}</h2>
        <p className="dialog-hint">{t('diagnostics.intro')}</p>
        <div className="diagnostics-row">
          <label>
            <input type="checkbox" checked={enabled} onChange={(event) => toggle(event.target.checked)} />
            {' '}{t('diagnostics.enable')}
          </label>
        </div>
        <p className="dialog-hint">{enabled ? t('diagnostics.enabledHint') : t('diagnostics.disabledHint')}</p>
        <div className="dialog-field">
          <span>{t('diagnostics.previewTitle')}</span>
          <pre className="diagnostics-preview">{preview || t('diagnostics.empty')}</pre>
        </div>
        <p className="dialog-hint">{t('diagnostics.count', { count })}</p>
        <div className="dialog-actions">
          <button className="tool" onClick={clear}>{t('diagnostics.delete')}</button>
          <button className="tool" onClick={exportLog}>{t('diagnostics.export')}</button>
          <button className="primary-button" onClick={onClose}>{t('diagnostics.close')}</button>
        </div>
      </section>
    </div>
  );
}
