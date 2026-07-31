/// <reference types="node" />

import Module from 'node:module';

/**
 * Metro resolves `require('…/NotoSansJP-Regular.otf')` to an asset handle. Node's
 * CommonJS loader has no rule for the extension and parses the font as JavaScript,
 * so register one: the module under test receives an opaque handle the way it does
 * on a device, and it carries the real path, which lets a test read the bytes the
 * app actually ships instead of inventing some.
 */
(
  Module as unknown as {
    _extensions: Record<string, (module: { exports: unknown }, filename: string) => void>;
  }
)._extensions['.otf'] = (module, filename) => {
  module.exports = { assetPath: filename };
};
