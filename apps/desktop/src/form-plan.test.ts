import { describe, expect, it } from 'vitest';
import type { PdfFormField } from '@iroha-pdf/core';

import {
  FILLABLE_FIELD_TYPES,
  initialFormValues,
  isChoiceField,
  valuesToFill,
} from './form-plan';

const field = (overrides: Partial<PdfFormField> & Pick<PdfFormField, 'name' | 'type'>): PdfFormField => ({
  options: [],
  readOnly: false,
  required: false,
  ...overrides,
});

describe('the desktop form plan', () => {
  it('seeds every control from the value the document already has', () => {
    const fields = [
      field({ name: 'name', type: 'text', value: 'Ada Lovelace' }),
      field({ name: 'approved', type: 'checkbox', value: true }),
      field({ name: 'department', type: 'dropdown', options: ['Engineering', 'Design'], value: 'Design' }),
      field({ name: 'tags', type: 'option-list', options: ['a', 'b'], value: ['b'] }),
    ];

    expect(initialFormValues(fields)).toEqual({
      name: 'Ada Lovelace',
      approved: true,
      department: 'Design',
      tags: ['b'],
    });
  });

  it('reads a dropdown selection pdf-lib reports as a one-item list', () => {
    const fields = [
      field({ name: 'department', type: 'dropdown', options: ['Engineering', 'Design'], value: ['Design'] }),
    ];
    expect(initialFormValues(fields)).toEqual({ department: 'Design' });
  });

  it('sends an emptied text field, because clearing it is an answer', () => {
    const fields = [field({ name: 'name', type: 'text' })];
    expect(valuesToFill(fields, { name: '' })).toEqual({ name: '' });
  });

  it('leaves an untouched choice alone rather than resetting it', () => {
    const fields = [
      field({ name: 'department', type: 'dropdown', options: ['Engineering', 'Design'] }),
      field({ name: 'tags', type: 'option-list', options: ['a', 'b'] }),
    ];
    expect(valuesToFill(fields, { department: '', tags: [] })).toEqual({});
  });

  it('keeps a chosen option and a list of them', () => {
    const fields = [
      field({ name: 'department', type: 'dropdown', options: ['Engineering', 'Design'] }),
      field({ name: 'tags', type: 'option-list', options: ['a', 'b'] }),
    ];
    expect(valuesToFill(fields, { department: 'Design', tags: ['a', 'b'] })).toEqual({
      department: 'Design',
      tags: ['a', 'b'],
    });
  });

  it('names the field kinds that can be presented, and the ones it cannot', () => {
    for (const type of ['text', 'checkbox', 'radio', 'dropdown', 'option-list'] as const) {
      expect(FILLABLE_FIELD_TYPES.has(type)).toBe(true);
    }
    expect(FILLABLE_FIELD_TYPES.has('signature')).toBe(false);
    expect(FILLABLE_FIELD_TYPES.has('button')).toBe(false);
  });

  it('treats every picker as a choice and a text field as not one', () => {
    expect(isChoiceField('radio')).toBe(true);
    expect(isChoiceField('dropdown')).toBe(true);
    expect(isChoiceField('option-list')).toBe(true);
    expect(isChoiceField('text')).toBe(false);
    expect(isChoiceField('checkbox')).toBe(false);
  });
});
