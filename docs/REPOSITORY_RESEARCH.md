# PDF ecosystem research

調査日: 2026-07-12

GitHubのdefault branch、README、package manifest、root license、直近commitを確認しました。GitHub Topic画面の「Updated」はissue、release、default branch以外の活動を含む場合があるため、ここでは再現可能なdefault branchの最新commit日を併記します。

## Executive decision

直接採用するもの:

- EmbedPDF: desktop renderer/editor。MIT、PDFium、plugin architecture。
- pdf-lib: mobile/desktop共通のPDF生成、page operation、flatten export。MIT。
- react-native-pdf: mobile renderer。MIT。
- Pedaruの設計: SQLite session、tab、Google Drive bookshelf、secret wrapperの考え方。
- Xournal++の設計: PDFと注釈を分ける非破壊編集、autosave、layer。
- react-pdf-highlighterの設計: page-relativeな正規化座標。
- Obsidian PDF++の設計: annotationとplain-text note/linkを分離し、特定viewerにロックインしない。

直接採用しないもの:

- AGPL/GPLの実装コード: 配布アプリのlicenseへ影響するため。
- web-only React/Vue viewerをmobile rendererとして使う案: WebView memoryとfile bridgeが弱い。
- 更新停止したviewer: 新規基盤にはしない。
- Xodo: proprietary productであり、機能とUXのbenchmarkに限定。

## Comparison matrix

| Project | Default branch latest commit | Main stack | License observed | Editing | Mobile fit | Desktop fit | Decision |
|---|---:|---|---|---|---|---|---|
| Xodo | Product, no source | Proprietary multi-platform | Proprietary | Full | High | High | UX benchmark only |
| togatoga/pedaru | 2026-01-17 | Next.js, React, Tauri, Rust, PDF.js, SQLite | Apache-2.0 | View/translate only | Low | High | Reuse architecture ideas |
| sumatrapdf | 2026-07-11 | C/C++, Win32, MuPDF | GPL-3.0 | Viewer | None | Windows high | Performance benchmark |
| Xournal++ | 2026-07-03 | C++, GTK, Poppler | GPL-2.0 | Annotation | Separate mobile effort | High | Non-destructive model |
| BentoPDF | 2026-07-10 | TypeScript, Vite, WASM | AGPL-3.0 or commercial | Broad toolkit | WebView possible | Web high | Requirements only |
| react-pdf | 2026-07-09 | React, PDF.js | MIT | Viewer | Web only | Web/Tauri good | Pedaru dependency; not RN |
| Sioyek | 2026-07-11 | C++, Qt, MuPDF | GPL-3.0 | Research annotation | None | High | Research UX ideas |
| vue-office | 2025-10-09 | Vue, PDF.js, office parsers | No root license found | Preview | Web only | Web only | Do not depend |
| pdf2htmlEX | 2025-07-17 | C++, Poppler, Cairo | GPL-3.0 | Conversion | None | CLI/server | Out of scope |
| pdfme | 2026-07-10 | TypeScript, React, pdf-lib, PDF.js | MIT | Template designer | Partial | High | Future form/template feature |
| EmbedPDF | 2026-06-08 | TypeScript, React, PDFium WASM | MIT | Annotation/redaction/export | WebView risk | Excellent | Adopt on desktop |
| Emacs EAF | 2026-05-25 | Python, PyQt, JS, Emacs | GPL-3.0 | Viewer | None | Emacs only | Reject |
| react-pdf-viewer | 2024-07-31 | React, PDF.js | Commercial root license | Viewer/print | Web only | Web | Reject |
| Obsidian PDF++ | 2025-08-30 | TypeScript, Obsidian/PDF.js | MIT | Link-based annotation | Obsidian mobile only | Obsidian | Note-link design |
| vue-pdf | 2024-03-05 | Vue, PDF.js | MIT | Viewer/experimental print | Web only | Web | Stale; reject |
| OpenComic | 2026-07-11 | Electron, JavaScript | GPL-3.0 | Reader | None | High | Provider/cache UX only |
| pdfpc | 2026-04-23 | Vala, GTK, Poppler | GPL-3.0 | Presentation | None | Linux-focused | Reject |
| Obsidian Annotator | 2024-01-08 | TypeScript, Hypothesis, Obsidian | AGPL-3.0 | Annotation | Obsidian only | Obsidian | Stale; reject |
| PdfDing | 2026-07-09 | Python web app | AGPL-3.0 | Text/highlight/draw/sign | Browser | Browser/server | Feature benchmark |
| Pympress | 2026-03-20 | Python, GTK, Poppler | GPL-2.0 | Presentation annotation | None | Desktop | Cache ideas only |
| PDF4QT | 2026-07-11 | C++, Qt | MIT | Full-ish editor | None | Excellent | Native-engine reference |
| react-pdf-highlighter | 2024-09-14 | React, PDF.js | MIT | Highlight UI | Web only | Web | Coordinate model only |

## 1. Xodo

Xodoは公開OSSではありません。2026年の公式製品群はmobile、web、Windows/macOS/Linux reader、PDF Studio、Google Workspace integrationに分かれています。公式ページではmobileがview、scan、edit、annotate、convert、compress、e-signを提供し、desktop readerはGoogle Drive、Dropbox、OneDrive連携を掲げています。

参考にする点:

- file providerから開き、編集後に元providerへ戻す短い導線
- mobileでは下部tool rail、desktopでは上部toolbar
- annotation、page organize、convertを別modeに分ける
- free readerとadvanced editorの機能境界
- cloud名を前面に出すのではなく、「Open」「Save a copy」のdestinationとして扱う

採用しない点:

- 全機能を初期版へ詰め込むこと
- server uploadが必要な処理とlocal処理の区別を曖昧にすること

Sources: [Xodo Mobile](https://xodo.com/mobile-apps), [Xodo desktop reader](https://xodo.com/pdf-studio/free-pdf-reader), [Google Drive workflow](https://xodo.com/blog/how-to-edit-pdf-in-google-drive)

## 2. togatoga/pedaru

Pedaru v0.2.2はdesktop専用です。Next.js/React frontendをTauri 2が包み、Rust側でSQLite、Google OAuth/Drive、secret、session、bookshelfを実装しています。PDFはreact-pdf/PDF.jsで表示します。

強い点:

- session、tabs、windows、bookmarks、historyをSQLiteへ保存
- Google Drive folderをbookshelfとして扱う
- background downloadとthumbnail
- OAuth secretを`SecureString`で包み、Debug/Displayから隠す
- Rust commandとReact hookの責務分離

弱い点:

- 2026-01-17以降default branchのcommitがなく、半年更新されていない
- mobile非対応
- PDF書き込み/annotationなし
- Driveはdownload中心で、複数端末のannotation mergeではない
- issue #25のfile tabsが未完。READMEのpage tabsとは意味が異なる
- issue #7ではmigration startup failureが報告され、DB初期化に注意が必要

結論: fork/portしない。schema、OAuth、background job、secret handlingを設計資料として利用する。

Source: [togatoga/pedaru](https://github.com/togatoga/pedaru)

## 3. SumatraPDF

Windows nativeで非常に軽いreaderです。MuPDFを中心とするC/C++実装で、GPL-3.0です。

学ぶ点:

- startup timeを重要指標にする
- pageを必要時にrenderし、cache上限を設ける
- UI chromeを小さくする
- file watcherで外部変更を即reload

使わない理由: Windows/Win32特化、GPL、編集機能が主目的ではない。

## 4. Xournal++

PDF背景の上へ独自`.xopp` layerを置き、最後にPDFへexportする方式です。手書き、highlighter、text、shape、stylus pressure、autosave、backupが成熟しています。

最重要の学びは「編集途中にPDF binaryを毎回書き換えない」です。Iroha PDFのSQLite/Drive sidecar方式はこの考えを採用しています。

使わない理由: GTK/C++/GPL-2.0で、モバイルUIへ直接移植できない。

## 5. BentoPDF

2026-07-10時点で活発なprivacy-first client-side toolkitです。merge/split/reorder、annotation、form、image→PDF、compression、OCR、deskew、booklet、N-up、PDF/Aなど要求機能を広くカバーします。

技術的にはpdf-lib、PDF.js、qpdf-wasm、wasm-vips、Tesseract.jsなどを組み合わせ、一部の高度機能はCDNからPyMuPDF/Ghostscript/CPDF WASMを読みます。

注意:

- 本体はAGPL-3.0または商用license
- PyMuPDF/Ghostscript/CPDFもAGPL系
- mobile WebViewではWASM download sizeとmemoryが大きい

結論: feature checklistと処理pipelineの参考。コードは流用しない。商用licenseを購入する場合のみ再評価する。

## 6. wojtekmaj/react-pdf

React向けPDF.js wrapperで、Pedaruのrendererです。MITで活発ですがDOM前提です。

Tauri/webには適しますがReact Native viewでは動きません。Iroha PDF desktopはannotation/exportを持つEmbedPDFを優先し、mobileはreact-native-pdfを使います。

## 7. Sioyek

研究論文と教科書向けのQt/MuPDF viewerです。smart jump、overview、portal、mark、keyboard commandが強みです。

Iroha PDF P2候補:

- PDF内リンクのpreview
- equation/figureへ戻るportal
- command palette
- keyboard-first navigation

GPL-3.0のためコードは利用しません。

## 8. vue-office

DOCX/XLSX/PDF/PPTXのweb previewをまとめます。PDFはPDF.js + virtual listです。root licenseが見つからず、PDF編集機能もありません。

結論: dependencyにしない。Office previewを将来入れる場合もformatごとに別engineを評価する。

## 9. pdf2htmlEX

PDFをlayout-preserving HTMLへ変換するCLIです。検索可能HTMLやfont position再現には強い一方、Poppler/FontForge/Cairoを必要とし、GPL-3.0です。

アプリ内viewer/editorには過剰で、mobile offline処理にも不適です。アクセシブルHTML exportを将来backendで行う場合のみ候補です。

## 10. pdfme

MITのTypeScript/React PDF generation toolkitです。pdf-lib、PDF.js、designer、plugin schema、CLI validationを持ちます。

向く用途:

- 帳票template
- form-like placement
- invoice/certificate generation

向かない用途:

- 任意の既存PDFを軽く読むmobile viewer
- freehand note中心のUI

P2のtemplate designerで採用候補です。

## 11. EmbedPDF

MIT、TypeScript、PDFium/WASMです。annotation（highlight、sticky note、free text、ink）、true redaction、search、virtualized scroll、export、printがpluginとして分離されています。

採用理由:

- active project
- PDF.js wrapperよりediting/export能力が高い
- tree-shakable plugin
- renderer、annotation、print、exportが独立
- Tauri WebViewと相性がよい

mobileで採用しない理由:

- WASM engine + WebView bridgeのmemory peak
- local file bytesの往復
- WKWebView/Android WebView差
- background/low-memory recoveryがnative rendererより難しい

Source: [embedpdf/embed-pdf-viewer](https://github.com/embedpdf/embed-pdf-viewer)

## 12. Emacs Application Framework

EmacsへPyQt/browser applicationを埋め込むframeworkです。PDF viewerはsub-applicationで、本repo自体はPDF編集基盤ではありません。GPL-3.0かつEmacs固有なので対象外です。

## 13. react-pdf-viewer

plugin型React/PDF.js viewerで、search、thumbnail、print、theme、accessibilityを提供します。しかしdefault branchのlatest commitは2024-07-31で、root LICENSEはcommercial license購入を要求します。

結論: 新規依存にしない。

## 14. Obsidian PDF++

PDF selectionをMarkdown link/backlinkとして保存し、viewer固有JSONへ閉じ込めない設計が優秀です。MITです。

Iroha PDFへ採用する考え:

- note本文はplain text/Markdown
- PDF位置は`documentId + page + rect`でlink化
- annotationが壊れてもnote自体は読める
- PDF annotationへの直接書き込みはexport時だけ

Obsidian APIへ強く依存するためコード全体は利用しません。

## 15. vue-pdf

Vue 2時代のPDF.js wrapperでexperimental printを持ちます。MITですがlatest commitは2024-03-05です。

結論: maintenanceとVue世代の理由で不採用。

## 16. OpenComic

Electronのcomic/manga readerで、PDF/EPUB、SMB/SFTP/S3/WebDAV、bookmark、reading position、image filtersを持ちます。

学ぶ点:

- provider abstraction
- remote filesのcache
- view mode per document
- recent progress

GPL-3.0かつreader中心なのでコードは利用しません。

## 17. pdfpc

Presenter consoleです。dual display、notes、media、laser pointerが主目的で、一般PDF editingとは異なります。Vala/GTK/Poppler/GPL-3.0のため対象外です。

## 18. Obsidian Annotator

Hypothesis annotationをObsidianへ統合します。Markdown出力とlinkingは参考になりますが、AGPL-3.0でlatest commitが2024-01-08です。PDF++よりlock-inも強いため不採用です。

## 19. PdfDing

Self-hosted web PDF managerです。multi-device resume、collection/tag、text/highlight/drawing/signature、Markdown notes、OIDC、sharingを持ちます。

Iroha PDFとの差:

- PdfDingはserver-centric
- Iroha PDFはlocal-first + user-owned Drive

AGPL-3.0のためfeature benchmarkに限定します。

## 20. Pympress

Presentation向けPython/GTK/Poppler appです。200 pageまでのrender cache、file auto-reload、editable annotationが参考になります。

一般editorではなくGPL-2.0のため不採用。cacheは固定page数ではなくmemory budgetで実装すべきです。

## 21. PDF4QT

MITへ移行したC++/Qt PDF editorです。annotation、form、encryption、signature validation、compression、CLI、text layout analysisを持ちます。

重要性:

- permissive native editorとして技術的に最も強い候補
- desktop完全native engineへ移行する場合の第一候補
- text editやsignature validationのreferenceになる

ただしQt runtime、React/Tauriとの二重UI、mobile非対応があるため、初期版には組み込みません。

## 22. react-pdf-highlighter

PDF.js上のtext/image highlight componentです。MITですがlatest commitは2024-09-14です。

ライブラリ本体は採用せず、page-relative coordinateとscroll-to-highlightの考えだけを共有annotation modelへ採用しました。

## Additional engine: pdfcpu

ユーザー提示一覧外ですが、Apache-2.0のGo API/CLIでvalidate、optimize、split、merge、transform、N-up、booklet、securityを提供します。desktop compression/print optimization sidecarとしてGhostscriptよりlicense面で扱いやすい候補です。

Source: [pdfcpu official](https://pdfcpu.io/)

## Final ranking by use case

### 今すぐ採用

1. EmbedPDF desktop
2. pdf-lib shared operations
3. react-native-pdf mobile
4. Expo modules

### 実装パターンを採用

1. Xournal++ sidecar/autosave
2. Pedaru SQLite/Drive/session
3. Obsidian PDF++ Markdown links
4. react-pdf-highlighter normalized rectangles
5. SumatraPDF/Pympress bounded cache

### P1/P2で再評価

1. pdfcpu desktop optimize/booklet
2. PDF4QT advanced editing
3. pdfme template/form designer
4. EmbedPDF mobile WebView experiment only

### 採用しない

- license incompatible: AGPL/GPL codebases
- stale/commercial ambiguity: react-pdf-viewer, vue-pdf, Obsidian Annotator
- wrong product shape: pdfpc, EAF, pdf2htmlEX, vue-office
