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
  'app.localWorkspace': { ja: 'ローカルファースト・ワークスペース', en: 'Local-first workspace' },
  'app.preparing': { ja: 'ワークスペースを準備しています…', en: 'Preparing workspace…' },
  'app.loadingEngine': { ja: 'PDFエンジンを読み込んでいます…', en: 'Loading local PDF engine…' },
  'app.emptyHelp': { ja: 'PDFを開いて読み、注釈を加え、変更内容をファイルへ直接保存できます。', en: 'Open a PDF to read, annotate, and save your changes straight back to the file.' },
  'app.engineFailed': { ja: 'PDFエンジンを起動できませんでした。', en: 'The PDF engine could not start.' },
  'app.engineFailedHelp': { ja: 'アプリを再起動してください。解決しない場合は、診断ログを添えて問題を報告してください。', en: 'Restart the app. If the problem continues, report it with the diagnostic log.' },

  'document.open': { ja: 'PDFを開く', en: 'Open PDF' },
  'document.openFiles': { ja: 'ファイルを開く', en: 'Open files' },
  'document.openAnother': { ja: '別のPDFを開く', en: 'Open another PDF' },
  'document.opening': { ja: 'PDFを開いています…', en: 'Opening PDF…' },
  'document.openFailed': { ja: 'このPDFを開けませんでした。', en: 'This PDF could not be opened.' },
  'document.details': { ja: '書類の詳細', en: 'Document details' },
  'document.pages': { ja: 'ページ', en: 'Pages' },
  // Read aloud by VoiceOver and TalkBack. The separators are part of the
  // translation: a Japanese reader should hear a Japanese list, not an English
  // one with a Japanese title spliced into it.
  'document.itemLabel': { ja: '{title}、PDF、{size}', en: '{title}, PDF, {size}' },
  'document.closeTab': { ja: 'タブを閉じる', en: 'Close tab' },
  'document.untitled': { ja: '名称未設定のPDF', en: 'Untitled PDF' },
  'document.list': { ja: '書類', en: 'Documents' },
  'document.search': { ja: 'PDFとメモを検索', en: 'Search PDFs and notes' },
  'document.noPdf': { ja: 'PDFはまだありません', en: 'No PDFs yet' },
  'document.noMatch': { ja: '一致するPDFがありません', en: 'No matching PDFs' },
  'document.searchAgain': { ja: '別のキーワードで検索してください。', en: 'Try a different search.' },
  'document.importHelp': { ja: '「ファイル」、Google Drive、またはほかのアプリからPDFを開けます。', en: 'Open a PDF from Files, Google Drive, or another provider.' },
  'document.deleteTitle': { ja: '端末内のコピーを削除しますか？', en: 'Delete local copy?' },
  'document.deleteBody': { ja: '「{name}」とその注釈をこの端末から削除します。FilesやGoogle Driveにある元ファイルは変更されません。', en: 'Remove “{name}” and its annotations from this device? The original file in Files or Google Drive is not changed.' },
  'document.more': { ja: '「{name}」のその他の操作', en: 'More actions for {name}' },
  'document.openHint': { ja: '書類を開きます', en: 'Open document' },
  'document.deleteHint': { ja: '端末内のコピーを削除します', en: 'Delete the local copy' },
  'document.loading': { ja: '書類を読み込んでいます', en: 'Loading document' },
  'document.notFound': { ja: '書類が見つかりません', en: 'Document not found' },
  'document.removed': { ja: 'この端末から削除された可能性があります。', en: 'It may have been removed from this device.' },
  'document.retry': { ja: 'もう一度開く', en: 'Try again' },
  'document.retryLabel': { ja: 'PDFをもう一度開きます', en: 'Try opening PDF again' },
  'document.sizeUnknown': { ja: 'サイズ不明', en: 'size unknown' },
  'document.export': { ja: '書き出す', en: 'Export' },
  'document.exporting': { ja: '書き出しています…', en: 'Exporting…' },
  'document.exportLabel': { ja: '編集済みPDFのコピーを書き出します', en: 'Export edited PDF copy' },
  'document.largeExportTitle': { ja: 'この端末では安全に書き出せません', en: 'This file is too large to export safely here' },
  'document.largeExportBody': { ja: '{limit} MBを超えるPDFの書き出しと印刷は、低メモリ時の強制終了を避けるためモバイル版では行いません。デスクトップ版を使用してください。閲覧と注釈の自動保存は続けられます。', en: 'To avoid an out-of-memory termination, mobile export and printing are unavailable for PDFs over {limit} MB. Use the desktop app instead. You can keep viewing and autosaving annotations.' },
  'document.unsupported': { ja: 'ファイルが破損しているか、このビューアーが対応していないPDF機能を使用している可能性があります。', en: 'The file may be damaged or use a PDF feature this viewer does not support.' },
  'document.pageOf': { ja: '{page} / {count}ページ', en: 'Page {page} of {count}' },
  'document.previousPage': { ja: '前のページ', en: 'Previous page' },
  'document.nextPage': { ja: '次のページ', en: 'Next page' },
  'document.sourceLocal': { ja: '端末内', en: 'local' },
  'document.sourceDrive': { ja: 'Google Drive', en: 'Google Drive' },
  'document.sourceIcloud': { ja: 'iCloud', en: 'iCloud' },
  'document.sourceProvider': { ja: 'ファイルプロバイダー', en: 'file provider' },
  'document.unsavedCloseOne': { ja: '未保存の変更が1件失われます。このPDFを閉じますか？', en: '1 unsaved change will be lost. Close this PDF anyway?' },
  'document.unsavedClose': { ja: '未保存の変更が{count}件失われます。このPDFを閉じますか？', en: '{count} unsaved changes will be lost. Close this PDF anyway?' },

  'edit.label': { ja: '編集', en: 'Edit' },
  'edit.undo': { ja: '元に戻す', en: 'Undo' },
  'edit.redo': { ja: 'やり直す', en: 'Redo' },
  'edit.history': { ja: '編集履歴', en: 'Edit history' },
  'edit.selected': { ja: '選択中', en: 'Selected' },
  'edit.highlight': { ja: 'マーカー', en: 'Highlight' },
  'edit.hand': { ja: '移動', en: 'Hand' },
  'edit.pen': { ja: 'ペン', en: 'Pen' },
  'edit.text': { ja: 'テキスト', en: 'Text' },
  'edit.eraser': { ja: '消しゴム', en: 'Eraser' },
  'edit.shape': { ja: '図形', en: 'Shape' },
  'edit.color': { ja: '色 {color}', en: 'Colour {color}' },
  'edit.strokeWidth': { ja: '線の太さ {width}', en: 'Stroke width {width}' },
  'edit.delete': { ja: '削除', en: 'Delete' },
  'edit.addText': { ja: 'テキストを追加', en: 'Add text' },
  'edit.textPlaceholder': { ja: 'PDFに追加するテキスト', en: 'Text on PDF' },
  'edit.annotationTool': { ja: '{name}注釈ツール', en: '{name} annotation tool' },
  'edit.annotationColor': { ja: '注釈の色 {color}', en: 'Annotation color {color}' },
  'edit.annotationCanvas': { ja: 'PDF注釈ページ', en: 'PDF annotation page' },
  'edit.inkWidth': { ja: 'ペンの太さ {width}', en: 'Ink width {width}' },
  'edit.penPressure': { ja: '筆圧を反映中', en: 'Pressure enabled' },
  'edit.zoomReadOnly': { ja: '{percent}%表示 — 注釈を選ぶと100%に戻ります', en: '{percent}% view — choose an annotation tool to return to 100%' },
  'edit.annotationSaveFailed': { ja: '注釈を保存できませんでした', en: 'Annotation could not be saved' },
  'edit.annotationDeleteFailed': { ja: '注釈を削除できませんでした', en: 'Annotation could not be removed' },
  'edit.undoLabel': { ja: '注釈を元に戻す', en: 'Undo annotation' },
  'edit.redoLabel': { ja: '注釈をやり直す', en: 'Redo annotation' },

  'note.label': { ja: 'メモ', en: 'Note' },
  'note.linked': { ja: 'リンクされたメモ', en: 'Linked note' },
  'note.placeholder': { ja: 'このPDFについてのメモ…', en: 'Write a memo for this PDF…' },
  'note.list': { ja: 'メモ', en: 'Notes' },
  'note.itemLabel': { ja: '{title}、メモ', en: '{title}, note' },
  'note.new': { ja: '新しいメモ', en: 'New note' },
  'note.untitled': { ja: '名称未設定のメモ', en: 'Untitled note' },
  'note.noMatch': { ja: '一致するメモがありません。', en: 'No matching notes.' },
  'note.emptyHelp': { ja: 'PDFと一緒に覚えておきたいことをメモできます。', en: 'Create a note to keep context beside your PDFs.' },
  'note.start': { ja: '書き始める…', en: 'Start writing…' },
  'note.write': { ja: '自由に入力してください…', en: 'Write anything…' },
  'note.title': { ja: 'タイトル', en: 'Title' },
  'note.titleLabel': { ja: 'メモのタイトル', en: 'Note title' },
  'note.bodyLabel': { ja: 'メモの本文', en: 'Note body' },
  'note.loading': { ja: 'メモを読み込んでいます', en: 'Loading note' },
  'note.notFound': { ja: 'メモが見つかりません', en: 'Note not found' },
  'note.deleteTitle': { ja: 'メモを削除しますか？', en: 'Delete note?' },
  'note.deleteBody': { ja: '「{name}」をこの端末から削除します。この操作は取り消せません。', en: 'Remove “{name}” from this device? This cannot be undone.' },
  'note.more': { ja: '「{name}」のその他の操作', en: 'More actions for {name}' },
  'note.openHint': { ja: 'メモを編集します', en: 'Edit note' },
  'note.deleteHint': { ja: 'このメモを削除します', en: 'Delete this note' },
  'note.saveFailed': { ja: 'メモを保存できませんでした', en: 'Note could not be saved' },

  'print.open': { ja: '印刷', en: 'Print' },
  'print.dialogTitle': { ja: 'PDFを印刷', en: 'Print PDF' },
  'print.openPreview': { ja: '印刷プレビューを開く', en: 'Open print preview' },
  'print.allPages': { ja: 'すべてのページ', en: 'All pages' },
  'print.currentPage': { ja: '現在のページ', en: 'Current page' },
  'print.range': { ja: '範囲', en: 'Range' },
  'print.pageRange': { ja: 'ページ範囲', en: 'Page range' },
  'print.rangePlaceholder': { ja: '1,3,5-7', en: '1,3,5-7' },
  'print.includeAnnotations': { ja: '注釈を含める', en: 'Include annotations' },
  'print.pages': { ja: 'ページ', en: 'Pages' },
  'print.preparing': { ja: '準備しています…', en: 'Preparing…' },
  'print.failed': { ja: '印刷できませんでした', en: 'Print failed' },

  'autosave.saved': { ja: 'この端末に自動保存しました', en: 'Autosaved locally' },
  'autosave.stopped': { ja: '自動保存が停止しました。', en: 'Autosave has stopped.' },
  'autosave.stoppedBody': { ja: '{time}以降、下書きを保存できていません。ブラウザーストレージが満杯または無効なため、クラッシュすると作業が失われます。ファイルへ保存してください。', en: 'Nothing has been drafted since {time} — browser storage is full or blocked, so a crash would lose this work. Save to put it in the file.' },
  'recovery.found': { ja: '保存されていなかった作業を復元しました。', en: 'Unsaved work recovered.' },
  'recovery.restore': { ja: '復元する', en: 'Restore' },
  'recovery.discard': { ja: '破棄する', en: 'Discard' },
  'recovery.title': { ja: '復旧コピー', en: 'Recovery copies' },
  'recovery.bannerTitle': { ja: '中断された編集があります', en: 'Interrupted edits available' },
  'recovery.bannerBodyOne': { ja: '1件の復旧コピーを確認できます。', en: 'Review 1 recovery copy.' },
  'recovery.bannerBody': { ja: '{count}件の復旧コピーを確認できます。', en: 'Review {count} recovery copies.' },
  'recovery.bannerLabelOne': { ja: '中断された編集が1件あります', en: '1 interrupted edit available' },
  'recovery.bannerLabel': { ja: '中断された編集が{count}件あります', en: '{count} interrupted edits available' },
  'recovery.bannerHint': { ja: '復旧コピーを確認します', en: 'Review recovery copies' },
  'recovery.description': { ja: '最後に正常保存できた状態を保持しています。復元する前に、中断された編集内容を確認してください。', en: 'The last valid saved state was kept. Review the interrupted edit before restoring it.' },
  'recovery.empty': { ja: '復旧が必要な中断編集はありません。', en: 'No interrupted edits need recovery.' },
  // Said instead of `recovery.empty` when the list could not be read at all. The
  // difference matters more here than anywhere: this screen exists to answer
  // whether interrupted work survived, and "there is none" is the one answer it
  // must never give when it simply failed to look.
  'recovery.unavailable': { ja: '中断編集を読み込めませんでした。保存領域が使えないため、復旧できる編集があるかどうかは不明です。', en: 'The interrupted edits could not be read. Storage is unavailable, so whether anything can be recovered is unknown.' },
  'recovery.retry': { ja: '再試行', en: 'Try again' },
  'recovery.discardTitle': { ja: '復旧コピーを破棄しますか？', en: 'Discard recovery copy?' },
  'recovery.discardBody': { ja: '破棄すると、この中断された編集は復元できません。', en: 'This interrupted edit cannot be recovered after it is discarded.' },
  'recovery.discardLabel': { ja: '復旧コピーを破棄', en: 'Discard recovery copy' },
  'recovery.restoreLabel': { ja: '復旧コピーを復元', en: 'Restore recovery copy' },
  'recovery.restoreCopy': { ja: 'コピーを復元', en: 'Restore copy' },
  'recovery.failed': { ja: '復旧できませんでした', en: 'Recovery failed' },
  'recovery.note': { ja: 'メモ', en: 'Note' },
  'recovery.annotation': { ja: '注釈', en: 'Annotation' },
  'recovery.noteEdit': { ja: 'メモの編集', en: 'Note edit' },
  'recovery.annotationEdit': { ja: '注釈の編集', en: 'Annotation edit' },
  'recovery.emptyNote': { ja: '（空のメモ）', en: '(empty note)' },
  'recovery.rolledBack': { ja: '保存前に中断', en: 'Interrupted before save' },
  'recovery.diverged': { ja: '競合あり', en: 'Diverged' },
  'recovery.failedStatus': { ja: '失敗', en: 'Failed' },
  'recovery.desktopDetailOne': { ja: '{time}の注釈1件が、このファイルに保存されていません。', en: '1 annotation from {time} never reached this file.' },
  'recovery.desktopDetail': { ja: '{time}の注釈{count}件が、このファイルに保存されていません。', en: '{count} annotations from {time} never reached this file.' },

  'save.saving': { ja: '保存しています…', en: 'Saving…' },
  'save.downloaded': { ja: 'コピーをダウンロードしました', en: 'Downloaded a copy' },
  'save.savedTo': { ja: '{name}に保存しました', en: 'Saved to {name}' },
  'save.save': { ja: '保存', en: 'Save' },
  'save.saveCount': { ja: '保存（{count}）', en: 'Save ({count})' },
  'save.saveAs': { ja: '別名で保存…', en: 'Save as…' },
  'save.downloadCopy': { ja: 'コピーをダウンロード', en: 'Download copy' },
  'save.notAllowed': { ja: '保存に失敗しました — この場所への書き込みは許可されていません。', en: 'Save failed — Iroha PDF is not allowed to write there.' },
  'save.diskFull': { ja: '保存に失敗しました — ディスクの空き容量がありません。', en: 'Save failed — the disk is full.' },
  'save.notWritable': { ja: '保存に失敗しました — このファイルには書き込めません。', en: 'Save failed — that file is not writable.' },
  'save.notOpen': { ja: '保存に失敗しました — この書類は開かれていません。', en: 'Save failed — this document is not open.' },
  'save.failed': { ja: '保存に失敗しました — PDFを書き込めませんでした。', en: 'Save failed — the PDF could not be written.' },
  // A save assembles the new bytes beside the document and only then renames them over
  // it, so a failure never leaves a half-written file. Someone who has just been told
  // their save failed has no way to know that, and it is the first thing they want.
  'save.unchanged': { ja: 'ディスク上のファイルはそのままです。', en: 'The file on disk is unchanged.' },

  'thumbnails.label': { ja: 'ページ', en: 'Pages' },
  // Read out by a screen reader in place of the picture, so it says which page this
  // is rather than describing a thumbnail nobody can see.
  'thumbnails.page': { ja: '{page}ページ目', en: 'Page {page}' },
  'thumbnails.empty': { ja: 'ページを読み込んでいます…', en: 'Loading pages…' },

  'history.empty': { ja: '編集はまだありません。追加したマーカー、ペン、テキストと、PDFを保存した履歴がここに表示されます。', en: 'No edits yet. Highlights, pen strokes, and text you add will be listed here, along with every time this PDF was saved.' },
  'history.saved': { ja: '保存', en: 'Saved' },
  'history.savedAs': { ja: '別名で保存', en: 'Saved as' },
  'history.editOne': { ja: '編集1件', en: '1 edit' },
  'history.edits': { ja: '編集{count}件', en: '{count} edits' },
  'history.added': { ja: '追加', en: 'Added' },
  'history.changed': { ja: '変更', en: 'Changed' },
  'history.removed': { ja: '削除', en: 'Removed' },
  'history.page': { ja: '{page}ページ', en: 'page {page}' },

  // What kind of mark an edit was. The history keeps the identifier and looks
  // the name up at render time, so a timeline written before the reader
  // switched language still reads in the language they are using now.
  'annotation.highlight': { ja: 'マーカー', en: 'Highlight' },
  'annotation.ink': { ja: 'ペンの線', en: 'Pen stroke' },
  'annotation.freetext': { ja: 'テキスト', en: 'Text' },
  'annotation.square': { ja: '図形', en: 'Shape' },
  'annotation.circle': { ja: '楕円', en: 'Ellipse' },
  'annotation.underline': { ja: '下線', en: 'Underline' },
  'annotation.strikeout': { ja: '取り消し線', en: 'Strikeout' },
  'annotation.squiggly': { ja: '波線', en: 'Squiggly' },
  'annotation.stickyNote': { ja: '付箋', en: 'Sticky note' },
  'annotation.stamp': { ja: 'スタンプ', en: 'Stamp' },
  'annotation.line': { ja: '直線', en: 'Line' },
  /** Anything the annotation plugin reports that this list does not name. */
  'annotation.other': { ja: '注釈', en: 'Annotation' },

  'drive.openHint': { ja: '任意のGoogle Drive接続画面を開きます', en: 'Open the optional Google Drive connection screen' },
  'drive.intro': { ja: 'Google Driveから任意で取り込めます。Iroha PDFが要求するのはdrive.fileとappDataFolder権限だけで、Drive内のすべてのファイルを閲覧することはできません。', en: 'Optional import from Google Drive. Iroha PDF requests only drive.file and appDataFolder access; it cannot browse every file in your Drive.' },
  'drive.unavailable': { ja: 'このビルドでは利用できません', en: 'Not available in this build' },
  'drive.unavailableBody': { ja: 'リリース管理者が本番用Google OAuthクライアントを設定していません。端末内のPDF機能は引き続き利用できます。', en: 'The release owner has not configured the production Google OAuth client. Local PDF features remain available.' },
  'drive.configurationRequired': { ja: '設定が必要です', en: 'Configuration required' },
  'drive.configurationBody': { ja: 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_IDを設定し、開発クライアントを再ビルドしてください。', en: 'Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID and rebuild the development client.' },
  'drive.connect': { ja: 'Google Driveに接続', en: 'Connect Google Drive' },
  'drive.refresh': { ja: '一覧を更新', en: 'Refresh files' },
  'drive.refreshLabel': { ja: 'Google Driveのファイル一覧を更新', en: 'Refresh Google Drive files' },
  'drive.disconnect': { ja: '接続を解除', en: 'Disconnect' },
  'drive.disconnectLabel': { ja: 'Google Driveの接続を解除', en: 'Disconnect Google Drive' },
  'drive.disconnectTitle': { ja: 'Google Driveの接続を解除しますか？', en: 'Disconnect Google Drive?' },
  'drive.disconnectBody': { ja: 'この端末だけログアウトするか、GoogleアカウントからIroha PDFの権限を取り消せます。ダウンロード済みの端末内コピーは削除されません。', en: 'Sign out on this device, or revoke Iroha PDF access from your Google account. Downloaded local copies are not deleted.' },
  'drive.signOut': { ja: 'ログアウト', en: 'Sign out' },
  'drive.revoke': { ja: '権限を取り消す', en: 'Revoke access' },
  'drive.working': { ja: 'Google Driveと通信しています', en: 'Working with Google Drive' },
  'drive.downloadLabel': { ja: '「{name}」をダウンロード', en: 'Download {name}' },
  'drive.downloadHint': { ja: 'オフラインコピーを保存して開きます', en: 'Save an offline copy and open it' },
  'drive.empty': { ja: 'アプリから参照できるPDFがありません。drive.file権限では、Iroha PDFから開いた、または作成したPDFだけがここに表示されます。', en: 'No app-visible PDFs. With drive.file, open or create a PDF through Iroha PDF before it appears here.' },
  'drive.refreshFailed': { ja: '更新できませんでした', en: 'Refresh failed' },
  'drive.disconnectFailed': { ja: '接続を解除できませんでした', en: 'Disconnect failed' },
  'drive.downloadFailed': { ja: 'ダウンロードできませんでした', en: 'Download failed' },

  'tools.title': { ja: 'PDFツール', en: 'PDF tools' },
  'tools.intro': { ja: '基本処理はすべてこの端末内で行います。元ファイルは上書きしません。', en: 'All basic processing stays on this device. Originals are never overwritten.' },
  'tools.choosePdf': { ja: 'PDFを選ぶ', en: 'Choose PDF' },
  'tools.choosePdfs': { ja: 'PDFを選ぶ', en: 'Choose PDFs' },
  'tools.chooseImages': { ja: '画像を選ぶ', en: 'Choose images' },
  'tools.imagesTitle': { ja: '画像 → PDF', en: 'Images → PDF' },
  'tools.imagesDescription': { ja: '複数の画像を選び、大きな写真を縮小・JPEG圧縮してA4のPDFを作成します。', en: 'Select multiple images, resize large photos, compress to JPEG, and create an A4 PDF.' },
  'tools.reorderTitle': { ja: 'ページを並べ替える', en: 'Reorder pages' },
  'tools.reorderDescription': { ja: '出力順を1から始まるページ番号で入力します。同じページを繰り返すと複製できます。', en: 'Enter the output order using one-based page numbers. Repeating a page duplicates it.' },
  'tools.pageOrder': { ja: 'ページの並び順', en: 'Page order' },
  'tools.mergeTitle': { ja: 'PDFを結合', en: 'Merge PDFs' },
  'tools.mergeDescription': { ja: '2つ以上のPDFを選びます。元ファイルを変更せず、選択した順にページをコピーします。', en: 'Select two or more PDFs. Pages are copied in the selected file order without changing the originals.' },
  'tools.pagesTitle': { ja: 'ページ操作', en: 'Page operations' },
  'tools.pagesDescription': { ja: '1-3,5のようにページ番号や範囲を入力し、抽出・削除・回転します。', en: 'Enter page numbers or ranges, such as 1-3,5. Then extract, remove, or rotate those pages.' },
  'tools.pagesLabel': { ja: '処理するページ', en: 'Pages to process' },
  'tools.extract': { ja: '抽出', en: 'Extract' },
  'tools.remove': { ja: '削除', en: 'Remove' },
  'tools.rotate': { ja: '90°回転', en: 'Rotate 90°' },
  'tools.optimizeTitle': { ja: '安全なPDF最適化', en: 'Safe PDF optimization' },
  'tools.optimizeDescription': { ja: 'ページを画像化せず、PDFのオブジェクト構造を書き直します。埋め込み画像は変えないため、結果はファイルごとに異なります。', en: 'Rewrites PDF object streams without rasterizing pages. Results vary because embedded images remain unchanged.' },
  'tools.printDescription': { ja: '選択したPDFをiOSまたはAndroidの印刷画面で開きます。', en: 'Open the native iOS or Android print dialog for a selected PDF.' },
  'tools.working': { ja: '処理中: {name}…', en: 'Working: {name}…' },
  'tools.failed': { ja: '{name}に失敗しました', en: '{name} failed' },
  'tools.selectTwo': { ja: '2つ以上のPDFを選んでください', en: 'Select at least two PDFs' },
  'tools.pageNumbers': { ja: '3,1,2のように1から始まるページ番号を入力してください', en: 'Use one-based page numbers such as 3,1,2' },
  // Desktop's page operations. Worded separately from `tools.*` because the
  // mobile Tools screen shares a picker with them and desktop does not: here the
  // pages come from the document already open, so the sentences say so.
  'pages.label': { ja: 'ページ', en: 'Pages' },
  'pages.open': { ja: 'ページ操作…', en: 'Pages…' },
  'pages.dialogTitle': { ja: 'ページを操作する', en: 'Work with pages' },
  'pages.selection': { ja: '対象ページ', en: 'Pages' },
  'pages.selectionHint': { ja: '例: 2, 5, 9-12', en: 'For example 2, 5, 9-12' },
  'pages.splitHint': { ja: '分割する位置。例: 10（10ページ目の後ろで切ります）', en: 'Where to cut. For example 10 splits after page 10.' },
  'pages.extract': { ja: '抽出して保存', en: 'Extract to a new PDF' },
  'pages.extractDescription': { ja: '選んだページだけを新しいPDFにします。', en: 'Keeps only the pages you name, as a new PDF.' },
  'pages.remove': { ja: '削除して保存', en: 'Remove and save' },
  'pages.removeDescription': { ja: '選んだページを除いた新しいPDFにします。', en: 'Everything except the pages you name, as a new PDF.' },
  'pages.split': { ja: '分割して保存', en: 'Split into two' },
  'pages.splitDescription': { ja: '指定ページの後ろで2つのPDFに分けます。', en: 'Cuts after the page you name, into two PDFs.' },
  'pages.merge': { ja: '結合して保存', en: 'Merge PDFs' },
  'pages.mergeDescription': { ja: '選んだ複数のPDFを1つにまとめます。開いている書類は変更しません。', en: 'Combines several PDFs you choose. The open document is not changed.' },
  'pages.run': { ja: '実行', en: 'Run' },
  'pages.working': { ja: '処理しています…', en: 'Working…' },
  'pages.wroteOne': { ja: '{name}に保存しました', en: 'Saved {name}' },
  'pages.wroteTwo': { ja: '{first}と{second}に保存しました', en: 'Saved {first} and {second}' },
  'pages.failed': { ja: 'ページ操作に失敗しました。', en: 'That page operation did not finish.' },
  'pages.untouched': { ja: '開いている書類はそのままです。', en: 'The open document is unchanged.' },
  'pages.enterPage': { ja: '1ページ以上入力してください', en: 'Enter at least one page' },
  'pages.invalidRange': { ja: '正しくないページ範囲です: {value}', en: 'Invalid page range: {value}' },
  'pages.invalidPage': { ja: '正しくないページ番号です: {value}', en: 'Invalid page number: {value}' },
  'pages.mergeNeedsTwo': { ja: '結合するには2つ以上のPDFを選んでください', en: 'Choose at least two PDFs to merge' },
  'pages.splitOnePage': { ja: '分割位置は1つだけ指定してください', en: 'Name a single page to split after' },
  'tools.enterPage': { ja: '1ページ以上入力してください', en: 'Enter at least one page' },
  'tools.invalidRange': { ja: '正しくないページ範囲です: {value}', en: 'Invalid page range: {value}' },
  'tools.invalidPage': { ja: '正しくないページ番号です: {value}', en: 'Invalid page number: {value}' },
  'tools.optimized': { ja: '最適化が完了しました', en: 'Optimization complete' },
  'tools.optimizedBody': { ja: '{before} → {after}\n構造の書き直しだけを行うため、同じサイズまたは大きくなる場合があります。文字と画像は保持され、画像は縮小しません。', en: '{before} → {after}\nThis structural rewrite may produce the same size or a larger file. It preserves text and images and does not downsample images.' },
  'tools.imageFailed': { ja: '画像{index}（{name}）を処理できませんでした: {reason}', en: 'Could not process image {index} ({name}): {reason}' },

  'password.title': { ja: 'パスワードで保護されたPDF', en: 'Password-protected PDF' },
  'password.body': { ja: '書類のパスワードを入力してください。ファイルを開くためだけに使用し、保存はしません。', en: 'Enter the document password. It is used only to open this file and is not saved.' },
  'password.placeholder': { ja: '書類のパスワード', en: 'Document password' },

  'error.storage': { ja: '端末内ストレージを利用できません', en: 'Local storage unavailable' },
  'error.export': { ja: '書き出しに失敗しました', en: 'Export failed' },

  'action.add': { ja: '追加', en: 'Add' },
  'action.cancel': { ja: 'キャンセル', en: 'Cancel' },
  'action.delete': { ja: '削除', en: 'Delete' },
  'action.open': { ja: '開く', en: 'Open' },
  'action.working': { ja: '処理中…', en: 'Working…' },
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

/** Hoisted so translating a string does not allocate a pattern per call; every
 * screen runs this on each render. */
const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * `{name}` placeholders are substituted from `values`. A placeholder with no
 * matching value is left as written rather than replaced with "undefined": a
 * visible `{count}` is a bug report, an invisible one is a support ticket.
 */
export function createTranslator(locale: Locale): Translate {
  return (key, values) => {
    const template = MESSAGES[key][locale];
    if (!values) return template;
    return template.replace(PLACEHOLDER, (whole, name: string) =>
      Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole,
    );
  };
}
