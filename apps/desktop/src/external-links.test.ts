import { describe, expect, it } from 'vitest';

import { externalUrlOrNull } from './external-links';

describe('external link policy', () => {
  it('accepts the schemes a document link is expected to use', () => {
    expect(externalUrlOrNull('https://example.com/path?q=1')).toBe('https://example.com/path?q=1');
    expect(externalUrlOrNull('http://example.com/')).toBe('http://example.com/');
    expect(externalUrlOrNull('mailto:someone@example.com')).toBe('mailto:someone@example.com');
    expect(externalUrlOrNull('tel:+81-3-1234-5678')).toBe('tel:+81-3-1234-5678');
  });

  it('refuses scripts, local files, custom handlers and nonsense', () => {
    for (const raw of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'data:text/html,<script>alert(1)</script>',
      'iroha-pdf://note-target?document=x',
      'not a url',
      '',
    ]) {
      expect(externalUrlOrNull(raw), raw).toBeNull();
    }
  });
});
