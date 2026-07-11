# GitHub issues backlog

このファイルの各`##`セクションを1件のGitHub Issueとして登録してください。`[x]`はstarterで実装済み、`[~]`は部分実装、`[ ]`は未実装です。実装済みでも実機証跡がない項目はcloseしないでください。

## 001 [x] Bootstrap Expo 57 / Tauri 2 monorepo

Labels: `type:foundation`, `priority:P0`

- Expo SDK 57 / RN 0.86 mobile appを配置
- Tauri 2 / React desktop appを配置
- shared packagesとroot scriptsを追加

Acceptance: `npm install`, `npm test`, `npm run typecheck`, desktop buildが成功する。

## 002 [x] Define shared document, annotation, note, tab, and sync models

Labels: `type:architecture`, `priority:P0`

- normalized coordinate annotation model
- local/cloud document identity
- PDF/note tabs
- append-only sync operation

Acceptance: mobile/desktopが同じ型をimportし、座標とmergeのunit testが通る。

## 003 [x] Add mobile SQLite schema and migrations

Labels: `platform:mobile`, `type:data`, `priority:P0`

- documents, notes, annotations
- WAL、foreign keys、indexes
- startup idempotency

Acceptance: fresh installとupgradeの両方でtableが作成される。migration失敗をUIへ表示できる。

## 004 [x] Import PDFs from system document providers

Labels: `platform:mobile`, `type:feature`, `priority:P0`

- iOS Files / iCloud / Drive provider
- Android Storage Access Framework / Drive provider
- cacheからapp documentsへcopy

Acceptance: 1 MB、300 MB、非ASCII filenameを実機で開ける。originalは変更しない。

## 005 [x] Build mobile PDF library and recent documents UI

Labels: `platform:mobile`, `type:ui`, `priority:P0`

Acceptance: search、source、size、recent orderが正しく、force close後も残る。

## 006 [~] Build mobile single-page PDF viewer

Labels: `platform:mobile`, `type:feature`, `priority:P0`

- react-native-pdf development build
- page navigation
- loading/error/password states
- zoom/pan gesture

Acceptance: portrait/landscape、iPad、Android tabletで表示。password PDF UIは未実装のため追加する。

## 007 [~] Add mobile annotation overlay

Labels: `platform:mobile`, `type:feature`, `priority:P0`

- text, fixed highlight, inkを実装済み
- drag highlight、selection highlight、eraser、move/resize、color、stroke、undo/redoを追加

Acceptance: zoom/rotation後もannotation位置がずれず、Apple PencilとAndroid stylusで滑らかに描ける。

## 008 [x] Flatten annotations into exported PDF copy

Labels: `type:pdf-engine`, `priority:P0`

Acceptance: exported PDFをPreview/Acrobat/Driveで開き、text/highlight/inkが同じ位置に表示される。original SHA-256は不変。

## 009 [x] Add lightweight notes with autosave

Labels: `type:feature`, `priority:P0`

- standalone note
- desktop PDF-linked note
- 250 ms debounce save

Acceptance: crash/force closeの直前入力を最大1秒以内の損失で復元する。

## 010 [~] Implement cross-platform document tabs

Labels: `type:feature`, `priority:P0`

- desktop PDF tabs実装済み
- mobile recent tabs、note/PDF混在tab、restoreを追加

Acceptance: reorder、close、reopen、last active pageがplatformごとに復元する。

## 011 [x] Convert multiple images to PDF

Labels: `type:pdf-tool`, `priority:P0`

- multi-select
- 2400pxへの縮小
- JPEG 0.82圧縮
- A4 fit + margin

Acceptance: EXIF orientation、PNG transparency、HEIC、50 imagesを検証し、失敗画像を特定して表示する。

## 012 [~] Add camera document scanning

Labels: `platform:mobile`, `type:pdf-tool`, `priority:P1`

- camera capture
- edge detection/crop
- perspective correction
- rotate、filter、reorder
- multi-page scan

Acceptance: A4紙を斜めから撮影し、読みやすい300 DPI相当PDFを作成できる。

## 013 [x] Reorder and duplicate PDF pages

Labels: `type:pdf-tool`, `priority:P0`

現在はpage number入力。thumbnail drag UIへ拡張する。

Acceptance: drag reorder、multi-select、duplicate、out-of-range rejection、undoを実装する。

## 014 [~] Add page organizer thumbnails

Labels: `type:pdf-tool`, `priority:P1`

- lazy thumbnail generation
- drag reorder
- delete、duplicate、rotateをcore/mobile toolsで実装済み。insert blank pageを追加
- selection mode

Acceptance: 500 pagesで全thumbnailを同時renderせず、操作が60 FPSに近い。

## 015 [~] Merge, split, and extract PDF pages

Labels: `type:pdf-tool`, `priority:P1`

mobile toolsでmultiple PDFs merge、range指定のselected pages extractを実装済み。bookmarkは現在保持しない。複数ファイルへの一括range splitを追加する。

Acceptance: multiple PDFs merge、range split、selected pages extract、bookmark保持可否を明示する。

## 016 [x] Add native mobile printing

Labels: `platform:mobile`, `type:print`, `priority:P0`

Acceptance: AirPrintとAndroid Print Serviceで、annotation込みcopyを印刷できる。

## 017 [~] Add desktop printing with annotations

Labels: `platform:desktop`, `type:print`, `priority:P0`

EmbedPDF print pluginは実装済み。page range、current page、annotation on/off dialogを追加する。

Acceptance: Windows/macOS/Linuxでprint previewと実出力を確認する。

## 018 [ ] Add print optimization profiles

Labels: `type:print`, `type:pdf-tool`, `priority:P1`

- original / A4 / Letter
- fit / actual size
- grayscale
- 150/300 DPI
- flatten forms/annotations
- bleed/margin warning

Acceptance: profileごとのfile size、visual difference、text searchabilityをテストする。

## 019 [ ] Add N-up, booklet, and poster print layouts

Labels: `platform:desktop`, `type:print`, `priority:P2`

pdfcpuを第一候補とする。

Acceptance: 2-up/4-up、duplex booklet、poster tileを正しいpage orderで生成する。

## 020 [x] Add safe structural PDF optimization

Labels: `type:pdf-tool`, `priority:P0`

Object Streamで再保存し、画像・text・linkを保持する。

Acceptance: UIで「必ず小さくなる圧縮」ではないと説明し、before/after sizeを表示する。

## 021 [ ] Integrate pdfcpu desktop sidecar

Labels: `platform:desktop`, `type:pdf-engine`, `priority:P1`

- Apache-2.0 license review
- bundled sidecar per architecture
- optimize、validate、merge/split、N-up/booklet
- progress/cancel/timeout

Acceptance: signed desktop package内でoffline動作し、sidecar hashを検証する。

## 022 [ ] Add balanced and aggressive PDF compression

Labels: `type:pdf-tool`, `priority:P1`

- image downsample
- JPEG quality
- grayscale option
- unused objects/fonts
- transparency and color profile tests

Acceptance: text/search/link保持モードとraster modeを分離。silent quality lossを禁止する。

## 023 [ ] Implement mobile native compression module

Labels: `platform:mobile`, `type:native-module`, `priority:P1`

Expo inline moduleでSwift/Kotlin実装を検討する。MuPDF/Ghostscript AGPL codeを無断で組み込まない。

Acceptance: 300 MB scanned PDFでOOMせず、background/cancel/progressに対応する。

## 024 [ ] Add OCR and searchable scanned PDFs

Labels: `type:pdf-tool`, `priority:P2`

- on-device OCR first
- Japanese/English
- invisible text layer
- page-level progress/cancel

Acceptance: scan画像の検索、copy、accessibility readingを確認する。

## 025 [ ] Add deskew and blank-page removal

Labels: `type:pdf-tool`, `priority:P2`

Acceptance: confidence thresholdとpreviewを提供し、originalへ自動適用しない。

## 026 [~] Configure Google OAuth clients for mobile

Labels: `platform:mobile`, `type:cloud`, `priority:P0`, `blocked:credentials`

- Google Cloud project
- iOS/Android/Web client IDs
- reversed client ID / SHA-1
- development build config plugin
- revoke/sign-out

Acceptance: physical iPhone/Androidでsign-inし、tokenをsecure storage以外へ残さない。

## 027 [ ] Configure Google OAuth PKCE for desktop

Labels: `platform:desktop`, `type:cloud`, `priority:P0`, `blocked:credentials`

- system browser
- loopback redirect or claimed scheme
- PKCE
- OS credential vault

Acceptance: Windows/macOS/Linuxでsign-in、refresh、revokeが動く。WebView内loginは禁止する。

## 028 [~] List and download app-visible Drive PDFs

Labels: `type:cloud`, `priority:P0`

REST clientとmobile UIは実装済み。OAuth実機設定、pagination、progress、cancelを追加する。

Acceptance: `drive.file`のみで選択済み/作成済みPDFをoffline cacheへ保存する。

## 029 [ ] Add Google Picker / Drive Open With flow

Labels: `type:cloud`, `priority:P0`

`drive.file`のまま既存Drive PDFをユーザーが明示選択できる導線を作る。

Acceptance: Drive全体scopeなしで既存PDFを選択し、file IDを保持できる。

## 030 [~] Upload and update Drive PDFs with resumable upload

Labels: `type:cloud`, `priority:P0`

client実装済み。chunk resume、retry、progress、network loss、large PDFの実機統合を追加する。

Acceptance: 300 MB uploadを中断/再開し、既存file ID updateとrevision取得が成功する。

## 031 [~] Sync metadata through Drive appDataFolder

Labels: `type:sync`, `priority:P0`

clientとbundle model実装済み。manifest、operation files、cursor persistenceを完成する。

Acceptance: phoneで作ったnote/annotationがdesktopへ、逆方向も反映する。

## 032 [~] Implement Drive Changes API sync loop

Labels: `type:sync`, `priority:P0`

API client実装済み。pagination、newStartPageToken、foreground/background schedulingを追加する。

Acceptance: deletion、rename、update、shared driveの対象範囲をtestする。

## 033 [ ] Add durable offline sync queue

Labels: `type:sync`, `priority:P0`

- SQLite operation queue
- exponential backoff + jitter
- idempotency key
- auth-required pause
- manual retry

Acceptance: airplane modeで100操作し、network復帰後に重複なく同期する。

## 034 [ ] Build PDF binary conflict resolution UI

Labels: `type:sync`, `priority:P0`

Acceptance: local/remote両方変更時にsilent overwriteせず、keep local/remote/bothを選べる。両版のrevisionと日時を表示する。

## 035 [ ] Merge annotation operations with tombstones

Labels: `type:sync`, `priority:P0`

Acceptance:同じannotationのedit/delete競合、時計ずれ、duplicate deliveryをdeterministicに解決する。

## 036 [ ] Upgrade note sync from LWW to Yjs

Labels: `type:sync`, `priority:P1`

Acceptance: mobile/desktopで同じnoteをoffline編集後、両方の段落を失わずmergeする。

## 037 [ ] Persist and sync recent workspace state

Labels: `type:sync`, `priority:P1`

- open tabs
- active PDF/note
- page and zoom
- per-device state + continue-on-device action

Acceptance: desktop sessionをmobileで1 tapで再開できる。

## 038 [ ] Add open-in-place provider bridge

Labels: `type:native-module`, `type:cloud`, `priority:P1`

Expo inline moduleでiOS security-scoped bookmarkとAndroid persistable URI permissionを保存し、Google Drive/iCloud/Filesへwrite-backする。

Acceptance: provider fileを開き、編集、元fileへ保存し、app restart後もpermissionが有効。

## 039 [ ] Add provider abstraction for OneDrive, Dropbox, WebDAV, and local folders

Labels: `type:cloud`, `priority:P2`

Acceptance: provider固有token/UIをcoreから分離し、Google Driveと同じdocument identity/conflict contractを満たす。

## 040 [ ] Add full-text search and document index

Labels: `type:feature`, `priority:P1`

- PDF text extraction
- note search
- page result snippets
- CJK tokenizer strategy

Acceptance: 10,000-page libraryでincremental indexとresult jumpが動く。

## 041 [ ] Link notes to PDF selections

Labels: `type:feature`, `priority:P1`

Obsidian PDF++の考えを参考に、plain Markdown linkとしてdocument/page/rectを保存する。

Acceptance: note linkをtapすると該当page/rectへjumpし、viewerを変更してもnote本文が読める。

## 042 [ ] Add signatures and stamps

Labels: `type:feature`, `priority:P1`

- draw/type/import signature
- secure local signature storage
- reusable stamp
- flatten export

Acceptance: biometric gate option、signature delete、no cloud upload defaultを実装する。

## 043 [ ] Add PDF form filling

Labels: `type:feature`, `priority:P2`

Acceptance: AcroForm text/checkbox/radio/dropdown、appearance update、flatten copyを検証する。XFAは非対応表示。

## 044 [ ] Add true redaction

Labels: `type:security`, `priority:P2`

黒いrectangleを置くだけにしない。underlying text/imageを削除できるengineを使う。

Acceptance: redact後にtext extraction、copy、object inspectionで元内容を復元できない。

## 045 [ ] Add password encryption, decrypt, and sanitize tools

Labels: `type:security`, `priority:P2`

Acceptance: owner/user password、metadata、attachments、JavaScript、embedded filesの扱いを明示し、強い暗号のみ使用する。

## 046 [ ] Add crash-safe autosave and recovery journal

Labels: `type:reliability`, `priority:P0`

Acceptance: annotation中にprocess kill、disk full、DB lockedを発生させ、last valid stateとrecovery copyを提示する。

## 047 [ ] Add bounded PDF render and thumbnail cache

Labels: `type:performance`, `priority:P0`

page数固定ではなくmemory budget、LRU、memory warningで管理する。

Acceptance: 300 MB/500-page PDFでOOMしない。peak memory証跡を保存する。

## 048 [ ] Benchmark Hermes/Reanimated and remove unused animation dependencies

Labels: `platform:mobile`, `type:performance`, `priority:P0`

Expo SDK 57既知のHermes V1/Reanimated memory問題を実機で測定する。starterはReanimatedを直接使用していない。

Acceptance: importあり/なし、Worklets Bundle Modeあり/なしでcold startとRSSを比較し、構成を決定する。

## 049 [ ] Add accessibility and keyboard support

Labels: `type:accessibility`, `priority:P1`

Acceptance: VoiceOver/TalkBack、dynamic type、contrast、external keyboard、focus order、reduced motionを実機検証する。

## 050 [ ] Add Japanese and English localization

Labels: `type:i18n`, `priority:P1`

Acceptance: UI、errors、print settings、OAuth explanation、file size/dateがlocale対応する。technical errorsをそのまま表示しない。

## 051 [~] Add privacy, security, and threat-model documentation

Labels: `type:security`, `priority:P0`

- local-first data flow
- OAuth scopes
- logs
- temporary files
- backups
- cloud deletion
- malicious PDF threat

Acceptance: store privacy label/data safety formと実装が一致する。

## 052 [ ] Sandbox untrusted PDF processing

Labels: `type:security`, `priority:P1`

Acceptance: engine update policy、CVE monitoring、WASM/native process isolation、external links confirmation、PDF JavaScript無効化を実装する。

## 053 [ ] Add dependency license audit and SBOM

Labels: `type:supply-chain`, `priority:P0`

Acceptance: CycloneDX SBOM、license allowlist、AGPL/GPL detection、npm/cargo advisoriesをCIで実行する。

## 054 [ ] Add unit, integration, and fixture-based PDF tests

Labels: `type:test`, `priority:P0`

Acceptance: `docs/TEST_PLAN.md`のfixtureを使い、golden image、text preservation、page count、file reopenを自動検証する。

## 055 [ ] Add mobile E2E tests

Labels: `platform:mobile`, `type:test`, `priority:P1`

Acceptance: import → annotate → export → reopen → print前までをMaestro/DetoxでiOS/Android実行する。

## 056 [ ] Add desktop E2E tests

Labels: `platform:desktop`, `type:test`, `priority:P1`

Acceptance: open → multi-tab → annotate → note → export → reopenをWindows/macOS/Linuxで実行する。

## 057 [~] Add GitHub Actions CI

Labels: `type:ci`, `priority:P0`

- install lockfile
- typecheck/test
- desktop web build
- Tauri matrix
- Expo config/prebuild validation
- SBOM/license/security scan

Acceptance: PR必須checkとして動き、artifact retentionを設定する。

## 058 [ ] Configure EAS development, preview, and production profiles

Labels: `platform:mobile`, `type:release`, `priority:P0`

Acceptance: internal distribution、store signing、environment separation、secret management、rollback手順を検証する。

## 059 [ ] Sign and release desktop packages

Labels: `platform:desktop`, `type:release`, `priority:P1`

Acceptance: Windows code signing、macOS notarization、Linux AppImage/deb、auto-update signatureを完了する。

## 060 [ ] Create onboarding and safe first-run sample

Labels: `type:product`, `priority:P1`

Acceptance: local-first説明、Drive権限説明、original非破壊、sample PDF、skipを含む。

## 061 [ ] Add optional privacy-preserving diagnostics

Labels: `type:observability`, `priority:P2`

Acceptance: opt-in、content/path/title/tokenを送らない、export/delete、crash report previewを提供する。

## 062 [ ] Validate store policy and publish privacy documents

Labels: `type:release`, `priority:P0`

Acceptance: Apple privacy manifest、Google Data Safety、OAuth verification、privacy policy、account/token deletion手順が一致する。

## 063 [ ] Add update and database rollback strategy

Labels: `type:reliability`, `priority:P1`

Acceptance: Expo update/native version compatibility、Tauri updater、DB forward migration、backup/restoreをrelease rehearsalで検証する。

## 064 [ ] Run full device and performance release gate

Labels: `type:release`, `priority:P0`

Acceptance: `docs/TEST_PLAN.md`全matrix、memory、battery、startup、large PDF、Drive conflict、print evidenceを保存し、release checklistをapproveする。

## 065 [~] Replace placeholder product identity and application icons

Labels: `type:design`, `type:release`, `priority:P1`

`Iroha PDF`、bundle identifier、package nameは設定済み。Expo/Tauriの正式な製品アイコンとstore screenshotsを追加する。

Acceptance: trademark/domain/store検索後に名称を確定し、adaptive icon、monochrome icon、iOS icon、splash、Tauri icons、store screenshotsを作成する。
