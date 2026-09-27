/**
 * Filling a PDF's AcroForm fields (#48).
 *
 * The reading and the writing are both here rather than in either application,
 * for the same reason the page-selection parser is: a form is filled on whichever
 * platform is holding the document, and two readers of the same field tree
 * disagree eventually. What is deliberately *not* here is the wording — core has
 * no locale — so a refusal says what was wrong and with which field, and each
 * caller looks the message up.
 *
 * Two shapes a form can take are refused rather than half-handled:
 *
 * - **XFA.** pdf-lib cannot read, write or create XFA data, and a hybrid file
 *   carries both trees. Writing the AcroForm half of an XFA file would produce a
 *   document whose visible values are the ones the viewer reads from XFA, so the
 *   caller is told the form is unsupported instead of being handed a file that
 *   looks filled and is not.
 * - **Signature and button fields.** A push button has no value, and a signature
 *   needs a signing key, not a string. Both are listed so a caller can say what
 *   they are, and both refuse a fill.
 */
import fontkit from '@pdf-lib/fontkit';
import {
  PDFButton,
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFField,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
  PDFTextField,
  type PDFFont,
} from 'pdf-lib';

/** The kinds of field this module can name. */
export type PdfFormFieldType =
  | 'text'
  | 'checkbox'
  | 'radio'
  | 'dropdown'
  | 'option-list'
  | 'signature'
  | 'button'
  | 'unknown';

/** What a caller may set a field to. */
export type PdfFormFieldValue = string | boolean | readonly string[];

export type PdfFormField = {
  name: string;
  type: PdfFormFieldType;
  /** Present for the three choice fields; empty for every other kind. */
  options: readonly string[];
  /** The current value, in the shape the type implies: string, boolean or list. */
  value?: string | boolean | readonly string[];
  readOnly: boolean;
  required: boolean;
};

export type PdfForm = {
  fields: PdfFormField[];
  /** True when the file also carries XFA data, which this module will not write. */
  xfa: boolean;
};

export type PdfFormProblem =
  | { reason: 'xfa-unsupported' }
  | { reason: 'unknown-field'; name: string }
  | { reason: 'unsupported-field'; name: string; type: PdfFormFieldType }
  | { reason: 'wrong-value'; name: string; expected: string }
  | { reason: 'invalid-option'; name: string; option: string };

export class PdfFormError extends Error {
  constructor(readonly problem: PdfFormProblem) {
    super(`Unusable PDF form: ${JSON.stringify(problem)}`);
    this.name = 'PdfFormError';
  }
}

/**
 * XFA presence has to be read out of the catalog directly.
 *
 * `document.getForm()` deletes XFA data and logs a warning before returning, so
 * `form.hasXFA()` is false by the time anyone can ask. Detecting it first is what
 * makes the refusal real rather than a check that never fires.
 */
function acroFormHasXfa(document: PDFDocument): boolean {
  const acroForm = document.catalog.get(PDFName.of('AcroForm'));
  if (!acroForm) return false;
  const dict = document.context.lookup(acroForm);
  return dict instanceof PDFDict && dict.has(PDFName.of('XFA'));
}

function fieldType(field: PDFField): PdfFormFieldType {
  if (field instanceof PDFTextField) return 'text';
  if (field instanceof PDFCheckBox) return 'checkbox';
  if (field instanceof PDFRadioGroup) return 'radio';
  if (field instanceof PDFDropdown) return 'dropdown';
  if (field instanceof PDFOptionList) return 'option-list';
  if (field instanceof PDFSignature) return 'signature';
  if (field instanceof PDFButton) return 'button';
  return 'unknown';
}

function currentValue(field: PDFField): PdfFormField['value'] {
  if (field instanceof PDFTextField) return field.getText();
  if (field instanceof PDFCheckBox) return field.isChecked();
  if (field instanceof PDFRadioGroup) return field.getSelected();
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) return field.getSelected();
  return undefined;
}

function fieldOptions(field: PDFField): readonly string[] {
  if (field instanceof PDFRadioGroup || field instanceof PDFDropdown || field instanceof PDFOptionList) {
    return field.getOptions();
  }
  return [];
}

/** Reads a form's fields without changing anything. Safe to call on any PDF. */
export async function readPdfForm(source: Uint8Array): Promise<PdfForm> {
  const document = await PDFDocument.load(source);
  // Do not call `getForm()` on an XFA file: that call deletes the XFA tree, and
  // the point of reporting it is to leave the document as it was found.
  if (acroFormHasXfa(document)) return { xfa: true, fields: [] };
  const form = document.getForm();
  return {
    xfa: false,
    fields: form.getFields().map((field) => ({
      name: field.getName(),
      type: fieldType(field),
      options: fieldOptions(field),
      value: currentValue(field),
      readOnly: field.isReadOnly(),
      required: field.isRequired(),
    })),
  };
}

export type FillPdfFormOptions = {
  /** Remove the fields after filling, leaving their appearance baked into the page. */
  flatten?: boolean;
  /**
   * Font used to draw text values. The built-in PDF fonts are WinAnsi and cannot
   * encode Japanese — the app's primary locale — so a caller whose values may be
   * outside Latin-1 has to supply one that covers their script. pdf-lib subsets
   * it, so only the glyphs actually drawn are carried.
   */
  textFont?: Uint8Array;
};

function assertStringValue(name: string, value: PdfFormFieldValue, type: PdfFormFieldType): string {
  if (typeof value !== 'string') {
    throw new PdfFormError({ reason: 'wrong-value', name, expected: `a string for ${type}` });
  }
  return value;
}

function assertChoice(name: string, value: PdfFormFieldValue, options: readonly string[]): string[] {
  const chosen = typeof value === 'string' ? [value] : Array.isArray(value) ? [...value] : null;
  if (!chosen || chosen.some((entry) => typeof entry !== 'string')) {
    throw new PdfFormError({ reason: 'wrong-value', name, expected: 'a choice or a list of choices' });
  }
  for (const entry of chosen) {
    if (!options.includes(entry)) {
      throw new PdfFormError({ reason: 'invalid-option', name, option: entry });
    }
  }
  return chosen;
}

/**
 * Writes `values` into the form's fields and returns the new bytes.
 *
 * Every value is checked before any is applied, so a bad field name or an option
 * that is not on the list refuses the whole fill rather than producing a document
 * with some of the answers in it. Fields not named in `values` are left alone.
 */
export async function fillPdfForm(
  source: Uint8Array,
  values: Readonly<Record<string, PdfFormFieldValue>>,
  options: FillPdfFormOptions = {},
): Promise<Uint8Array> {
  const document = await PDFDocument.load(source);
  if (acroFormHasXfa(document)) throw new PdfFormError({ reason: 'xfa-unsupported' });
  const form = document.getForm();

  const byName = new Map(form.getFields().map((field) => [field.getName(), field]));

  // Validate everything first. `fillPdfForm` loads its own copy, so a refusal here
  // has written nothing anywhere; this only makes that guarantee legible.
  const plan: Array<() => void> = [];
  for (const [name, value] of Object.entries(values)) {
    const field = byName.get(name);
    if (!field) throw new PdfFormError({ reason: 'unknown-field', name });
    const type = fieldType(field);

    if (field instanceof PDFTextField) {
      const text = assertStringValue(name, value, type);
      plan.push(() => field.setText(text));
      continue;
    }
    if (field instanceof PDFCheckBox) {
      if (typeof value !== 'boolean') {
        throw new PdfFormError({ reason: 'wrong-value', name, expected: 'a boolean for a checkbox' });
      }
      plan.push(() => (value ? field.check() : field.uncheck()));
      continue;
    }
    if (field instanceof PDFRadioGroup) {
      const [chosen] = assertChoice(name, value, field.getOptions());
      if (chosen === undefined) {
        throw new PdfFormError({ reason: 'wrong-value', name, expected: 'exactly one option for a radio group' });
      }
      plan.push(() => field.select(chosen));
      continue;
    }
    if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      const chosen = assertChoice(name, value, field.getOptions());
      plan.push(() => field.select(chosen));
      continue;
    }

    throw new PdfFormError({ reason: 'unsupported-field', name, type });
  }

  for (const apply of plan) apply();

  if (options.textFont) {
    document.registerFontkit(fontkit);
    const font: PDFFont = await document.embedFont(options.textFont, { subset: true });
    form.updateFieldAppearances(font);
  }
  if (options.flatten) {
    // Appearances were regenerated above with the caller's font when there is one;
    // otherwise let flatten use pdf-lib's default.
    form.flatten({ updateFieldAppearances: !options.textFont });
  }

  return document.save({
    useObjectStreams: true,
    // Regenerating here would overwrite the font-specific appearances written above.
    updateFieldAppearances: !options.textFont && !options.flatten,
  });
}
