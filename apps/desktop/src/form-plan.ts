/**
 * Turning form fields into editable values, and an edit back into a fill.
 *
 * Kept apart from `form-operations` so the rules can be tested without pdf-lib or
 * a Tauri runtime: which fields can be filled, what each starts at, and which
 * blank answers mean "leave it alone" rather than "clear it".
 */
import type { PdfFormField, PdfFormFieldValue } from '@iroha-pdf/core';

/** The field kinds the app can present; a signature needs a key, a button has no value. */
export const FILLABLE_FIELD_TYPES = new Set<PdfFormField['type']>([
  'text',
  'checkbox',
  'radio',
  'dropdown',
  'option-list',
]);

export function isChoiceField(type: PdfFormField['type']): boolean {
  return type === 'radio' || type === 'dropdown' || type === 'option-list';
}

/** Seeds each input from the field's current value, so an untouched field keeps it. */
export function initialFormValues(
  fields: readonly PdfFormField[],
): Record<string, PdfFormFieldValue> {
  const values: Record<string, PdfFormFieldValue> = {};
  for (const field of fields) {
    switch (field.type) {
      case 'text':
        values[field.name] = typeof field.value === 'string' ? field.value : '';
        break;
      case 'checkbox':
        values[field.name] = field.value === true;
        break;
      case 'radio':
        values[field.name] = typeof field.value === 'string' ? field.value : '';
        break;
      case 'dropdown':
        // pdf-lib reports a dropdown's selection as a list even when it is single.
        values[field.name] = Array.isArray(field.value)
          ? (field.value[0] ?? '')
          : typeof field.value === 'string'
            ? field.value
            : '';
        break;
      case 'option-list':
        values[field.name] = Array.isArray(field.value) ? [...field.value] : [];
        break;
      default:
        break;
    }
  }
  return values;
}

/**
 * What to send to `fillPdfForm`.
 *
 * A text field is always sent, because clearing it is a real answer. An unselected
 * choice is left out instead, so the field keeps whatever it already had rather
 * than being reset by an untouched control.
 */
export function valuesToFill(
  fields: readonly PdfFormField[],
  values: Readonly<Record<string, PdfFormFieldValue>>,
): Record<string, PdfFormFieldValue> {
  const result: Record<string, PdfFormFieldValue> = {};
  for (const field of fields) {
    const value = values[field.name];
    if (value === undefined) continue;
    if (isChoiceField(field.type) && (value === '' || (Array.isArray(value) && value.length === 0))) {
      continue;
    }
    result[field.name] = value;
  }
  return result;
}
