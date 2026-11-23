/**
 * Reading a form from the open document and writing a filled copy.
 *
 * The read, the validation and the write all live in `@iroha-pdf/core` (`readPdfForm`
 * and `fillPdfForm`); this module is the desktop half: it refuses a form the app
 * cannot present with a sentence the person can act on, and it saves the result as
 * a **new** file rather than touching the document being annotated (#48).
 *
 * Loaded dynamically from the toolbar: `pdf-lib` behind it is the same megabyte the
 * page operations keep out of the entry chunk.
 */
import {
  fillPdfForm,
  PdfFormError,
  readPdfForm,
  type PdfFormField,
  type PdfFormFieldValue,
} from '@iroha-pdf/core';

import {
  allowSaveSiblings,
  pickSaveLocation,
  writePdfToDisk,
} from './file-bridge';
import { FILLABLE_FIELD_TYPES } from './form-plan';
import { t } from './i18n';

/** A refusal already worded for the person who asked, rather than a failure. */
export class FormOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormOperationError';
  }
}

/** What to put in front of the user when the form could not be read or filled. */
export function describeFormFailure(error: unknown): string {
  if (error instanceof FormOperationError) return error.message;
  if (error instanceof PdfFormError) {
    switch (error.problem.reason) {
      case 'xfa-unsupported':
        return t('tools.formXfa');
      case 'unknown-field':
        return t('forms.unknownField', { name: error.problem.name });
      case 'wrong-value':
        return t('forms.invalidValue', { name: error.problem.name });
      case 'invalid-option':
        return t('forms.invalidOption', { name: error.problem.name, option: error.problem.option });
      case 'unsupported-field':
        return t('forms.invalidValue', { name: error.problem.name });
    }
  }
  return t('forms.failed');
}

function suggestedName(sourceName: string): string {
  return `${sourceName.replace(/\.pdf$/i, '')}-filled.pdf`;
}

/**
 * The fields the dialog can present, or a refusal that says why there are none.
 *
 * Read-only fields are left out: pdf-lib would write them, but a form the owner
 * locked is not something a filler should change. XFA is refused before reading
 * the fields, because `readPdfForm` deliberately does not touch that tree.
 */
export async function readEditableForm(source: Uint8Array): Promise<PdfFormField[]> {
  const form = await readPdfForm(source);
  if (form.xfa) throw new FormOperationError(t('tools.formXfa'));
  const fields = form.fields.filter(
    (field) => !field.readOnly && FILLABLE_FIELD_TYPES.has(field.type),
  );
  if (fields.length === 0) throw new FormOperationError(t('tools.formNoFields'));
  return fields;
}

export type FillFormOutcome =
  | { status: 'written'; path: string }
  | { status: 'cancelled' };

/**
 * Fills `values` into `source` and writes the result where the user chooses.
 *
 * The open document is never rewritten: the fill happens on the bytes the export
 * engine handed over, and the result goes through the same dialog, sibling grant
 * and atomic rename as every other produced file.
 */
export async function fillFormAndWrite(
  source: Uint8Array,
  values: Readonly<Record<string, PdfFormFieldValue>>,
  sourceName: string,
): Promise<FillFormOutcome> {
  const filled = await fillPdfForm(source, values);
  const target = await pickSaveLocation(suggestedName(sourceName));
  if (!target) return { status: 'cancelled' };
  await allowSaveSiblings(target);
  await writePdfToDisk(target, filled.slice().buffer as ArrayBuffer);
  return { status: 'written', path: target };
}
