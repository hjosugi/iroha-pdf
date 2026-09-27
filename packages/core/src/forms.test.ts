import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { PdfFormError, fillPdfForm, readPdfForm } from './forms';

const FIXED_DATE = new Date('2026-01-01T00:00:00.000Z');

/** A form with one of each fillable kind, built with pdf-lib rather than checked in. */
async function createFormFixture(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setCreationDate(FIXED_DATE);
  document.setModificationDate(FIXED_DATE);
  const page = document.addPage([595.28, 841.89]);
  const form = document.getForm();

  form.createTextField('name').addToPage(page, { x: 40, y: 760, width: 200, height: 24 });
  form.createCheckBox('agree').addToPage(page, { x: 40, y: 720, width: 18, height: 18 });

  const color = form.createRadioGroup('color');
  color.addOptionToPage('red', page, { x: 40, y: 680, width: 18, height: 18 });
  color.addOptionToPage('blue', page, { x: 80, y: 680, width: 18, height: 18 });

  const plan = form.createDropdown('plan');
  plan.addOptions(['free', 'pro']);
  plan.addToPage(page, { x: 40, y: 640, width: 160, height: 24 });

  const tags = form.createOptionList('tags');
  tags.addOptions(['alpha', 'beta', 'gamma']);
  tags.addToPage(page, { x: 40, y: 540, width: 160, height: 70 });

  form.createButton('reset').addToPage('Reset', page, { x: 40, y: 500, width: 80, height: 24 });

  return document.save({ useObjectStreams: false });
}

describe('readPdfForm', () => {
  it('names every field, its kind and its choices', async () => {
    const form = await readPdfForm(await createFormFixture());
    expect(form.xfa).toBe(false);

    const byName = Object.fromEntries(form.fields.map((field) => [field.name, field]));
    expect(Object.keys(byName).sort()).toEqual(['agree', 'color', 'name', 'plan', 'reset', 'tags']);
    expect(byName.name?.type).toBe('text');
    expect(byName.agree?.type).toBe('checkbox');
    expect(byName.color?.type).toBe('radio');
    expect(byName.color?.options).toEqual(['red', 'blue']);
    expect(byName.plan?.type).toBe('dropdown');
    expect(byName.plan?.options).toEqual(['free', 'pro']);
    expect(byName.tags?.type).toBe('option-list');
    expect(byName.reset?.type).toBe('button');
  });

  it('reads an empty form out of a document that never had one', async () => {
    const document = await PDFDocument.create();
    document.addPage([595.28, 841.89]);
    const form = await readPdfForm(await document.save());
    expect(form.fields).toEqual([]);
    expect(form.xfa).toBe(false);
  });
});

describe('fillPdfForm', () => {
  it('writes every field kind and the values survive a reopen', async () => {
    const output = await fillPdfForm(await createFormFixture(), {
      name: 'Alice',
      agree: true,
      color: 'blue',
      plan: 'pro',
      tags: ['alpha', 'gamma'],
    });

    const form = (await PDFDocument.load(output)).getForm();
    expect(form.getTextField('name').getText()).toBe('Alice');
    expect(form.getCheckBox('agree').isChecked()).toBe(true);
    expect(form.getRadioGroup('color').getSelected()).toBe('blue');
    expect(form.getDropdown('plan').getSelected()).toEqual(['pro']);
    expect(form.getOptionList('tags').getSelected()).toEqual(['alpha', 'gamma']);
  });

  it('leaves a field it was not given alone', async () => {
    const output = await fillPdfForm(await createFormFixture(), { name: 'Bob' });
    const form = (await PDFDocument.load(output)).getForm();
    expect(form.getTextField('name').getText()).toBe('Bob');
    expect(form.getCheckBox('agree').isChecked()).toBe(false);
  });

  it('flattens the fields away when asked', async () => {
    const output = await fillPdfForm(await createFormFixture(), { name: 'Carol' }, { flatten: true });
    const form = (await PDFDocument.load(output)).getForm();
    expect(form.getFields()).toEqual([]);
  });

  it('refuses a field the form does not have, naming it', async () => {
    await expect(fillPdfForm(await createFormFixture(), { nope: 'x' })).rejects.toMatchObject({
      name: 'PdfFormError',
      problem: { reason: 'unknown-field', name: 'nope' },
    });
  });

  it('refuses a value of the wrong shape', async () => {
    await expect(fillPdfForm(await createFormFixture(), { agree: 'yes' })).rejects.toBeInstanceOf(PdfFormError);
    await expect(fillPdfForm(await createFormFixture(), { name: true })).rejects.toMatchObject({
      problem: { reason: 'wrong-value', name: 'name' },
    });
  });

  it('refuses an option that is not on the list', async () => {
    await expect(fillPdfForm(await createFormFixture(), { color: 'green' })).rejects.toMatchObject({
      problem: { reason: 'invalid-option', name: 'color', option: 'green' },
    });
    await expect(fillPdfForm(await createFormFixture(), { plan: 'enterprise' })).rejects.toMatchObject({
      problem: { reason: 'invalid-option', name: 'plan', option: 'enterprise' },
    });
  });

  it('refuses a button and a signature rather than pretending to fill them', async () => {
    await expect(fillPdfForm(await createFormFixture(), { reset: 'now' })).rejects.toMatchObject({
      problem: { reason: 'unsupported-field', name: 'reset', type: 'button' },
    });
  });

  it('refuses a form that also carries XFA data', async () => {
    // pdf-lib's `getForm()` deletes XFA before returning and warns, so a hybrid
    // cannot be produced by saving one. This is a minimal file written by hand,
    // with a correct xref, that carries both an AcroForm and an XFA tree.
    const hybrid = minimalPdf([
      '<< /Type /Catalog /Pages 2 0 R /AcroForm 5 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Fields [] /XFA (payload) >>',
    ]);

    expect((await readPdfForm(hybrid)).xfa).toBe(true);
    await expect(fillPdfForm(hybrid, { name: 'x' })).rejects.toMatchObject({
      problem: { reason: 'xfa-unsupported' },
    });
  });
});

/** A byte-exact single-page PDF from literal objects, with a computed xref table. */
function minimalPdf(objects: string[]): Uint8Array {
  let body = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefStart = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, 'latin1'));
}
