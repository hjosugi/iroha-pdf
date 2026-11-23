import { useEffect, useRef, useState } from 'react';
import type { PdfFormField, PdfFormFieldValue } from '@iroha-pdf/core';

import { initialFormValues, valuesToFill } from './form-plan';
import { t } from './i18n';

/**
 * The desktop half of form filling (#48).
 *
 * The fields and the values come from `packages/core/src/forms.ts`, which mobile
 * already used. This renders them as ordinary controls and hands the answers back
 * to the toolbar, which writes a new copy and never touches the open document.
 */
export function FormDialog({
  fields,
  documentName,
  onClose,
  onSubmit,
}: {
  fields: readonly PdfFormField[];
  documentName: string;
  onClose: () => void;
  onSubmit: (values: Readonly<Record<string, PdfFormFieldValue>>) => Promise<void>;
}) {
  const [values, setValues] = useState(() => initialFormValues(fields));
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

  const setValue = (name: string, value: PdfFormFieldValue) =>
    setValues((current) => ({ ...current, [name]: value }));

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(valuesToFill(fields, values));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={() => !busy && onClose()}>
      <section
        ref={dialogRef}
        className="print-dialog form-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-dialog-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="form-dialog-title">{t('forms.dialogTitle')}</h2>
        <p className="dialog-hint">{documentName}</p>

        <div className="form-fields">
          {fields.map((field) => (
            <FormField
              key={field.name}
              field={field}
              value={values[field.name]}
              onChange={(value) => setValue(field.name, value)}
            />
          ))}
        </div>

        <div className="dialog-actions">
          <button className="tool" onClick={onClose} disabled={busy}>
            {t('action.cancel')}
          </button>
          <button className="primary-button" onClick={() => void submit()} disabled={busy}>
            {t('forms.submit')}
          </button>
        </div>
      </section>
    </div>
  );
}

function FormField({
  field,
  value,
  onChange,
}: {
  field: PdfFormField;
  value: PdfFormFieldValue | undefined;
  onChange: (value: PdfFormFieldValue) => void;
}) {
  const name = (
    <span className="form-field-name">
      {field.name}
      {field.required ? <em className="form-required">{t('tools.formRequired')}</em> : null}
    </span>
  );

  if (field.type === 'text') {
    return (
      <label className="form-field">
        {name}
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <label className="form-field form-field-inline">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        {name}
      </label>
    );
  }

  if (field.type === 'option-list') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset className="form-field form-choice-list">
        <legend className="form-field-name">{field.name}</legend>
        {field.options.map((option) => {
          const on = selected.includes(option);
          return (
            <label key={option} className="form-field-inline">
              <input
                type="checkbox"
                checked={on}
                onChange={() =>
                  onChange(
                    on ? selected.filter((entry) => entry !== option) : [...selected, option],
                  )
                }
              />
              {option}
            </label>
          );
        })}
      </fieldset>
    );
  }

  // Radio groups and dropdowns both pick one option; one control presents both.
  return (
    <label className="form-field">
      {name}
      <select
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t('forms.keepCurrent')}</option>
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
