/**
 * Messages for the two locales this product ships in.
 *
 * Hand-rolled rather than pulled from a library, for the same reason the
 * documentation site has no generator: the whole requirement is "pick one of
 * two locales and look up a string", and a dependency that does plural rules,
 * lazy namespace loading and ICU parsing would be carried by every platform to
 * satisfy none of it.
 *
 * The catalogue is one object with both languages side by side, so a message
 * cannot be added in English and silently forgotten in Japanese — the type of
 * every entry requires both, and a missing key is a compile error at the call
 * site rather than a fallback string in front of a user.
 */
export type Locale = 'ja' | 'en';

export const LOCALES: readonly Locale[] = ['ja', 'en'];

type Message = Readonly<Record<Locale, string>>;

const MESSAGES = {
  'app.name': { ja: 'Iroha PDF', en: 'Iroha PDF' },
  'app.tagline': { ja: '散らからない、あなたの書類。', en: 'Your documents, without the clutter.' },
  'app.localFirst': { ja: 'ローカルファースト', en: 'Local-first' },
  'app.preparing': { ja: 'ワークスペースを準備しています…', en: 'Preparing workspace…' },
  'app.loadingEngine': { ja: 'PDFエンジンを読み込んでいます…', en: 'Loading local PDF engine…' },

  'document.open': { ja: 'PDFを開く', en: 'Open PDF' },
  'document.openFiles': { ja: 'ファイルを開く', en: 'Open files' },
  'document.opening': { ja: 'PDFを開いています…', en: 'Opening PDF…' },
  'document.openFailed': { ja: 'このPDFを開けませんでした。', en: 'This PDF could not be opened.' },
  'document.details': { ja: '書類の詳細', en: 'Document details' },
  'document.pages': { ja: 'ページ', en: 'Pages' },
  'document.closeTab': { ja: 'タブを閉じる', en: 'Close tab' },

  'edit.label': { ja: '編集', en: 'Edit' },
  'edit.undo': { ja: '元に戻す', en: 'Undo' },
  'edit.redo': { ja: 'やり直す', en: 'Redo' },
  'edit.history': { ja: '編集履歴', en: 'Edit history' },
  'edit.selected': { ja: '選択中', en: 'Selected' },

  'note.label': { ja: 'メモ', en: 'Note' },
  'note.linked': { ja: 'リンクされたメモ', en: 'Linked note' },
  'note.placeholder': { ja: 'このPDFについてのメモ…', en: 'Write a memo for this PDF…' },

  'print.open': { ja: '印刷', en: 'Print' },
  'print.dialogTitle': { ja: 'PDFを印刷', en: 'Print PDF' },
  'print.openPreview': { ja: '印刷プレビューを開く', en: 'Open print preview' },
  'print.allPages': { ja: 'すべてのページ', en: 'All pages' },
  'print.currentPage': { ja: '現在のページ', en: 'Current page' },
  'print.range': { ja: '範囲', en: 'Range' },
  'print.pageRange': { ja: 'ページ範囲', en: 'Page range' },
  'print.rangePlaceholder': { ja: '1,3,5-7', en: '1,3,5-7' },
  'print.includeAnnotations': { ja: '注釈を含める', en: 'Include annotations' },

  'autosave.saved': { ja: 'この端末に自動保存しました', en: 'Autosaved locally' },
  'autosave.stopped': { ja: '自動保存が停止しました。', en: 'Autosave has stopped.' },
  'recovery.found': { ja: '保存されていなかった作業を復元しました。', en: 'Unsaved work recovered.' },
  'recovery.restore': { ja: '復元する', en: 'Restore' },
  'recovery.discard': { ja: '破棄する', en: 'Discard' },

  'action.cancel': { ja: 'キャンセル', en: 'Cancel' },
} as const satisfies Record<string, Message>;

export type MessageKey = keyof typeof MESSAGES;

/** Every key in the catalogue, so completeness can be asserted rather than assumed. */
export const MESSAGE_KEYS = Object.keys(MESSAGES) as readonly MessageKey[];

/**
 * Picks a locale from what the platform reports, in preference order. Matches
 * on the language subtag, so `ja-JP` and plain `ja` both resolve to Japanese
 * and a region this product does not distinguish cannot cause a miss.
 * Anything unrecognised falls to English, which is the wider net of the two.
 */
export function resolveLocale(preferred: readonly string[] | undefined): Locale {
  for (const tag of preferred ?? []) {
    const language = tag.split(/[-_]/)[0]?.toLowerCase();
    if (language && (LOCALES as readonly string[]).includes(language)) return language as Locale;
  }
  return 'en';
}

export type Translate = (key: MessageKey, values?: Readonly<Record<string, string | number>>) => string;

/**
 * `{name}` placeholders are substituted from `values`. A placeholder with no
 * matching value is left as written rather than replaced with "undefined": a
 * visible `{count}` is a bug report, an invisible one is a support ticket.
 */
export function createTranslator(locale: Locale): Translate {
  return (key, values) => {
    const template = MESSAGES[key][locale];
    if (!values) return template;
    return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
      Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole,
    );
  };
}
