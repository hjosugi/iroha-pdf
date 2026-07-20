# GitHub issues backlog

このファイルの各`##`セクションを1件のGitHub Issueとして登録してください。`[x]`はstarterで実装済み、`[~]`は部分実装、`[ ]`は未実装です。実装済みでも実機証跡がない項目はcloseしないでください。

## 001 [~] Bootstrap Expo 57 / Tauri 2 monorepo

Labels: `type:foundation`, `priority:P0`

- Expo SDK 57 / RN 0.86 mobile appを配置
- Tauri 2 / React desktop appを配置
- shared packagesとroot scriptsを追加

2026-07-20時点の検証状況:

| 項目 | 状態 |
|---|---|
| `tsc --noEmit` | 通る |
| `expo config --type public` | 通る |
| `expo-doctor` | 20項目中19通過。失敗はpatch versionのずれのみ（expo 57.0.4 対 期待57.0.7 など23パッケージ、いずれも同一minor内） |
| `expo prebuild --platform all` | android / ios両方の生成に成功 |
| **Android native build** | **成功**（下記） |
| **Android emulator起動** | **成功**（下記） |
| **iOS native build** | **未実施 — この環境では不可能** |
| unit test | **存在しない**（mobileに`test` scriptが無い） |

**Android build 実測（2026-07-20、初回・キャッシュ無し）:**

- 環境: Android SDK cmdline-tools 13114758 / platform 36 / build-tools 36.0.0、JDK 21、Gradle 9.3.1
- gradleがNDK（2.0 GB）とcmakeを自動取得した。事前に入れたのはcmdline-tools / platform / build-toolsのみ
- `./gradlew assembleDebug --no-daemon` → **BUILD SUCCESSFUL in 42m 51s**（788 tasks）
- 生成物: `app-debug.apk` **283.1 MB**。package `app.irohapdf.mobile`、versionName 0.1.0、compileSdk 36
- ABIはarm64-v8a / armeabi-v7a / x86 / x86_64の4種すべて。native library 112個、非圧縮253.1 MB

サイズはdebugビルドが未strippedのnative libraryを全ABI分同梱するため。**release APK / AABのサイズは未計測**で、store提出には別途確認が要る（#059）。

iOSは**macOS + Xcodeが必須**でLinuxでは原理的にビルドできない。EAS build（#058）かmacOS runnerが要る。

2回目（cache有り）は**12m 59s**。ディスク消費の実測（CI設計の参考）: SDK 2.6 GB + gradle cache 5.3 GB + 生成プロジェクト4.1 GB。初回42分はNDK取得とnative compileが大半なので、CIではSDKとgradle cacheの保存が要る。

**emulator実測（2026-07-20）:** `system-images;android-36;google_apis;x86_64`、KVM有効、headless。`apps/mobile/scripts/verify-on-emulator.sh`で7項目すべて通過:

- APKのinstall、Metroの配信、appのlaunch、processの生存、crash無し
- **JS bundleが実際に走った**（logcat: `Running "main" with {"rootTag":1,"fabric":true}` — 新アーキテクチャFabricで起動）
- screenshot取得

このAPKは`expo-dev-client`入りのため、**bundleが一切届かなくてもdev launcher画面を出してprocessは生き続ける**。「起動した」だけでは何の証明にもならないので、logcatの`ReactNativeJS`出力を「installできた」と「動く」の分岐点として使う。

画面を実際に見たことで#074（status barとの重なり）が見つかった。typecheckでもbuildでも出ないクラスのバグ。

なお`expo prebuild`は`package.json`の`android`/`ios` scriptを`expo run:*`へ書き換える副作用がある（managed → bare移行のため）。生成物と併せてrevertした。`android/` `ios/`は`.gitignore`へ追加済み — EASが再生成するので、古いコピーがcommitされるとapp.jsonより優先されてしまう。

Acceptance: `npm install`, `npm test`, `npm run typecheck`, desktop buildが成功する。**mobileのnative buildを別途acceptance対象にする。**

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

## 073 [x] Change the colour and width of an existing annotation

Labels: `platform:desktop`, `type:feature`, `priority:P1`

#072で色と太さを選べるようになったが**描く前にしか選べず**、既に置いた注釈を直すには消して描き直すしかなかった。このアプリが減らそうとしている手間そのもの。

注釈を選択すると同じpickerが選択対象にbindされ、`updateAnnotation`で書き換える。`toolForSubtype`でsubtypeからツールを引き、パレットと色フィールドを決める（#072の`colorPatchFor`をそのまま再利用）。

選択状態は`onStateChange`を購読して追従する。変更は未保存編集として計上されるので、保存せず閉じれば#069の確認が出る。

e2e 5件（`edit-existing.spec.ts`）。保存後のPDFの`/C`と`/BS /W`を読み、変更前と**異なる**ことも確認する。

実装中に判明した挙動: **図形は内部が透明なので中心をクリックしても選択できない**（枠線のみ当たる）。ペンは対角線が中心を通るため偶然当たっていた。テストは境界をクリックするようにした。UI上も、塗りつぶし無しの図形は枠線を狙う必要がある。

未実装: 複数選択への一括適用、不透明度、フォントサイズ、任意色。

## 074 [x] Mobile screens ignored the status bar on Android

Labels: `platform:mobile`, `type:bug`, `priority:P1`

emulatorで起動して**初めて見えた**バグ。header（"LOCAL-FIRST WORKSPACE" / "Iroha PDF"）がstatus barの時計と重なっていた。

原因: `react-native`の`SafeAreaView`を使っていた。これは**iOS専用**で、Androidでは何もしない。logcatにも`SafeAreaView has been deprecated ... Please use 'react-native-safe-area-context' instead`が出ていた。

修正: `index.tsx` / `note/[id].tsx` / `viewer/[id].tsx`のimportを`react-native-safe-area-context`（v5.7.0、expo-routerの依存として既に存在）へ変更し、`_layout.tsx`に`SafeAreaProvider`を追加。

emulatorで修正前後のスクリーンショットを比較して確認済み。

**この種のバグはtypecheckでもbuildでも出ない。** 実際に起動して画面を見るまで分からなかった。#001でmobileのnative buildとemulator起動を検証対象に加えた理由。

## 072 [x] Choose colour and stroke width per tool

Labels: `platform:desktop`, `type:feature`, `priority:P1`

すべての注釈がハードコードされた既定値のまま出ていた（highlight `#FFCD45`、ink/square/freeText `#E44234`、strokeWidth 6）。ハイライトが1色しか無いのは実用上きつく、線幅を変えられないpenは修正用途に向かない。

`apps/desktop/src/tool-settings.ts`:

- ツールごとに4色のパレット。highlightは蛍光ペン寄り、他はインク寄りの色
- ink / squareは線幅4段階（2 / 4 / 6 / 10）
- **色の格納先はツールごとに違う**（highlightは`color`+`strokeColor`、squareは`strokeColor`、freeTextは`fontColor`）。この差異を`colorPatchFor`に閉じ込め、呼び出し側では意識しない
- 選択は`setToolDefaults`でpluginへ反映し、localStorageへ保存する

UIはツール選択中のみ表示（読むだけのときはtoolbarを静かに保つ）。

e2e 5件（`tool-settings.spec.ts`）。「toolbarの見た目は変わるが既定色を書き込む」という失敗を捕まえるため、**保存後のPDFの`/C`と`/BS /W`を直接読んで**選んだ色・幅と一致することを検証する。既定値と一致して偶然通ることが無いよう、意図的に既定以外のswatchを選ぶ。

未実装: 不透明度、フォントサイズ、任意色（カラーピッカー）、既存注釈の色変更（現状は新規作成時のみ）。

## 071 [x] Delete the selected annotation with Delete / Backspace

Labels: `platform:desktop`, `type:feature`, `priority:P1`

注釈をクリックすると選択状態にはなるが、**消す手段が無かった**。undoで直後に戻すしかなく、後から開き直して「この書き込みを消す」ができない。「なおす」導線の半分が欠けていた。

`useDeleteSelected`でDelete / Backspaceを処理する。`INPUT` / `TEXTAREA` / `contentEditable`にフォーカスがあるときは奪わない（noteやFreeTextの入力を壊さないため）。

e2eで確認（`tools.spec.ts`）。

## 070 [x] Saving right after a pen stroke silently discarded it

Labels: `platform:desktop`, `type:bug`, `priority:P0`

**この製品が最も起こしてはいけない失敗が起きていた。**

penツールは複数ストロークを1つの注釈にまとめるため、pointerUpから`commitDelay`（既定800 ms）待ってから注釈を生成する。その窓の内側でSaveを押すと:

- 保存ファイルの注釈は空
- toolbarは「Saved to ...」と成功表示
- Saveボタンの未保存件数は0のまま、`beforeunload`ガードも作動しない

実測:

| ストローク後の待ち | 保存結果 |
|---|---|
| 200 ms | `[]` 失われる |
| 600 ms | `[]` 失われる |
| 900 ms | `["Ink"]` |

修正: `serialize()`がpenツール使用中のみ`commitDelay`を待ってから`commit()`する。penだけが遅延するので、他ツールの保存は遅くならない。

回帰テスト: 「ストローク直後にSave」で`Ink`が保存されることを確認（`tools.spec.ts`）。

残る穴: 窓の内側でタブを閉じた場合は依然として未保存として数えられない。ただし閉じる操作に800 ms以上かかるため実害は小さいと判断した。

## 069 [x] Confirm before discarding unsaved edits

Labels: `platform:desktop`, `type:bug`, `priority:P0`

タブのcloseが`closeDocument` + `forgetDocument`を即座に呼んでおり、**未保存の注釈が警告も痕跡も無く消えていた**。この製品が一番起こしてはいけない失敗。

修正:

- close時に`pendingEdits > 0`なら確認する。desktopは`tauri-plugin-dialog`の`ask`（native dialog、`dialog:default`に含まれる）、browser modeは`window.confirm`にfallback
- `beforeunload`で、未保存の編集があるdocumentが1つでもあればwindow closeをブロック

e2e 5件（`unsaved.spec.ts`）。ガードを外す変異でテスト1が落ちることを確認済み（テストが実効性を持つことの確認）。

未実装: autosave自体は無い（#046）。確認して「破棄」を選べば編集は失われる。

## 068 [x] Do not offer editing tools for a document that failed to open

Labels: `platform:desktop`, `type:bug`, `priority:P1`

壊れたPDFを開くと、エラーは表示されるのに編集ツールバーとSaveボタンも出ていた。ページ0枚のドキュメントに対してSaveを押すと`Task rejected: {"code":14,"message":"Document doc-... not found"}`という生のエンジンエラーがそのままUIに出ていた（#050の「technical errorsをそのまま表示しない」に違反）。

ファイル自体は破損しない（saveが失敗し、書き込みもbackup作成も起きない）ことは確認済み。

修正:

- `Workspace.tsx`が`DocumentState.status === 'loaded'`のときだけツールバーを描画する
- 保存失敗を`describeFailure`で人間向け文言へ変換し、生のエラーは`console.error`へ回す。書き込み不可・容量不足・権限・未オープンを区別する

e2eで回帰を防止（`open.spec.ts`）: 失敗時にツールバーが出ないこと、UIに`Task rejected` / `"code":` / `doc-17` / `undefined`が現れないこと。

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

`packages/core`の`flattenAnnotations`はannotationを焼き込んだ別コピーを返すため、original非破壊。この項目のscopeは維持する。

desktopは#066で元ファイルへの上書き保存を持つが、あちらは別経路（annotationを`/Annots`として保持、flattenしない）。original非破壊はbackup fileで担保する。

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

**動作確認済み（e2e 3件、`print.spec.ts`）。** printプラグインはbufferを用意して`printReady`イベントを出すだけで、実際の印刷は`PrintFrame`が担う。アプリはこれを明示的にmountしていないため動いていない疑いがあったが、`PrintPluginPackage`が`WithAutoMount`なので自動でmountされており、正常に機能していた。

検証内容: 印刷用に生成されるのが実際のPDFであること、page数と画像が保持されること、注釈が含まれること（toolbarは`includeAnnotations: true`で呼ぶ）、印刷が編集中の文書を変更しないこと。

ネイティブの印刷ダイアログは自動化をブロックするため、ダイアログを操作するのではなく`URL.createObjectURL`を捕まえて**印刷frameへ渡される文書そのもの**を読んで検証する。

未実装: page range、current page、annotation on/offのdialog。実プリンタへの出力確認。

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

## 046 [~] Add crash-safe autosave and recovery journal

Labels: `type:reliability`, `priority:P0`

autosaveとrecoveryを`apps/desktop/src/draft-store.ts`に実装。PDF全体ではなくannotationのみをdraftとして永続化する（41.6 MBのPDFは保存に1.4秒かかるため、数秒ごとの全体serializeは非現実的）。

実装済み:

- 編集のたびに`exportAnnotations()`の結果を800msデバウンスでlocalStorageへ書く
- 保存成功時にdraftを削除する（fileに入った以上、draftは守るものが無い）
- 再オープン時にdraftが残っていればrecovery bannerでRestore / Discardを提示する。**自動適用はしない** — 開いた直後の文書を黙って書き換えるのも一種のデータ損失のため
- stampの`ctx`が持つArrayBufferをbase64で保存する。`JSON.stringify`は素通しすると`{}`に潰すため
- 表現できない`ImageData`は落とし、`droppedItems`に件数を残す

**発見した罠**: `importAnnotations`はstoreへ直接dispatchしており`onAnnotationEvent`を発火しない（かつ既定でauto-commitする）。そのままでは復元した注釈が未保存として数えられず、Saveボタンが0件のままになる。ユーザーが「保存不要」と誤解して同じ作業を二度失う経路だったので、restore時に明示的に`recordEdit`する。

テスト: unit 9件（`draft-store.test.ts`、base64往復とcorrupt storage含む）、e2e 6件（`autosave.spec.ts`、reloadでクラッシュを再現）。

未実装:

- disk full / write失敗時の復旧導線
- draftはlocalStorage依存。storageを消すと消える
- mobileは未対応

Acceptance: annotation中にprocess kill、disk full、DB lockedを発生させ、last valid stateとrecovery copyを提示する。

## 047 [~] Add bounded PDF render and thumbnail cache

Labels: `type:performance`, `priority:P0`

page数固定ではなくmemory budget、LRU、memory warningで管理する。

**訂正**: このissueに以前「JSヒープがファイルサイズの8〜11倍、300 MB PDFで2〜3 GBとなりOOMする」と記載していたが、**誤りだった**。2つの測定アーティファクトが重なっていた:

1. `performance.memory`はChromeが量子化し約30秒キャッシュする。連続読み取りが同じ値を返すため、「スクロール後もヒープが変わらない」も根拠にならなかった
2. e2eのTauri stubが`read_file`で`Array.from()`を返しており、42 MBのファイルが4200万要素のJS配列（約350 MB）になっていた。実Tauriランタイムは`ArrayBuffer`を返す（実機で確認済み）

CDPの`Performance.getMetrics` + `HeapProfiler.collectGarbage`で測り直した実測値（2026-07-20）:

| 段階 | GC前 | 実使用 |
|---|---|---|
| アプリ起動時 | 2.4 MB | 6.1 MB |
| 41.6 MBのバイト列をページへ | 3.3 MB | 3.3 MB |
| 文書を開いてページ1描画 | 5.4 MB | 5.7 MB |
| 末尾までスクロール | 6.0 MB | 5.7 MB |

**JSヒープはドキュメントのサイズにほぼ依存せず、スクロールしても増えない。** 500ページで7.0 MB、41.6 MBのスキャンで5.2 MB。renderキャッシュはリークしていない。

実ランタイム（WebKitGTK、実ディスク）でのサイズ上限測定（`npm run e2e:tauri:ceiling`）:

| サイズ | 初回ページ描画まで |
|---|---|
| 41.6 MB | 1607 ms |
| 83.1 MB | 1986 ms |
| 124.7 MB | 2606 ms |
| 166.2 MB | 3153 ms |
| 249.4 MB | 5347 ms |

約21 ms/MBでほぼ線形。250 MBでもOOMせず開ける。

残作業:

- 300 MB以上および実スキャン（JPEG中心、本fixtureは非圧縮ノイズPNGで最悪ケース寄り）での確認
- memory warning / LRUの明示的な実装は依然として無い。現状「壊れていない」だけで、budget管理はされていない
- ArrayBufferとwasm memoryは`JSHeapUsedSize`に含まれない。RSSベースの測定は未実施

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

## 054 [~] Add unit, integration, and fixture-based PDF tests

Labels: `type:test`, `priority:P0`

`apps/desktop/e2e/fixtures.ts`がcomplex（表・透過PNG・CJK埋め込みフォント）、heavy（500ページ）、image-heavy（41.6 MB）、rotated-mixed、corrupt（破損）を生成し、gitには入れない。text preservation、page count、image count、font保持、annotation有無を`npm run e2e`で自動検証する。

視覚検証はpoppler / Ghostscriptを参照レンダラとして実施（#056）。固定閾値ではなく「正しいページとの距離 < 別ページとの距離の1/2」という相対判定にしてあるため、プラットフォーム間のフォント差で誤検知せず、かつ別ページを描画したら落ちる。

complex.pdfは`subset: false`でフォントを埋め込む。pdf-libのCFFサブセット化はpoppler / Ghostscriptが描画を拒否するフォントを生成し、それでは「アプリがフォントを壊しても検出できない」ため。

未実装: encrypted PDF、malformed but repairable PDF（現在のcorrupt fixtureは復旧不能な破損のみ）、form PDF。

## 055 [ ] Add mobile E2E tests

Labels: `platform:mobile`, `type:test`, `priority:P1`

Acceptance: import → annotate → export → reopen → print前までをMaestro/DetoxでiOS/Android実行する。

## 056 [~] Add desktop E2E tests

Labels: `platform:desktop`, `type:test`, `priority:P1`

Playwright + Chromiumで13件。`apps/desktop/e2e/tauri-stub.ts`が`plugin:fs|*` / `plugin:dialog|*`のinvokeプロトコルをin-memory filesystemで再実装するため、**アプリ側のコードは本物のまま**desktop保存経路を検証できる。

実Tauriランタイム版を`apps/desktop/e2e-tauri/run.mjs`に追加（`npm run e2e:tauri`）。tauri-driver + WebKitWebDriverで実バイナリを起動し、17項目を検証:

- 本番と同じWebKitGTK webviewでpdfiumが描画する（Chromiumのみだった穴を解消）
- capability拒否がRust側で実際に効く（`/etc/passwd`読み取り、スコープ外書き込み、`fs.remove`をすべて拒否）
- 実ディスク上のファイルが書き換わり、`*.iroha-original.pdf`が作られ、backupのSHA-256が元と一致
- 保存後ファイルの`/Annots`に`/Square`が存在し、CJK・表テキストが残る

未実装:

- **ネイティブfile dialogは自動化できない。** Wayland上のportal windowで、xdotoolはX11のみ、ydotool/wtypeは未インストール。e2eは`import.meta.env.DEV`のhookでpath指定で開き、dialogのscope付与は`IROHA_E2E_SCOPE`（`debug_assertions`限定）で代替している。dialog経由の選択は人手が必要。
- multi-tab、note、print
- Windows / macOSでの実行（現在Linux Chromium + WebKitGTKのみ）

Acceptance: open → multi-tab → annotate → note → export → reopenをWindows/macOS/Linuxで実行する。

## 057 [~] Add GitHub Actions CI

Labels: `type:ci`, `priority:P0`

- install lockfile
- typecheck/test
- desktop web build
- **e2e matrix（ubuntu / windows / macOS）を追加。** Playwright + Chromiumで15件。LinuxとmacOSではpoppler/ghostscript/imagemagickを入れてrendering検証まで走る。Windowsは`render.ts`の検出が失敗してrendering testが自動skipされる
- 失敗時にplaywright-reportをartifactへ（retention 14日）
- 遅いrunner向けに`PERF_BUDGET_SCALE=4`。時間予算のみscaleし、memory/sizeはscaleしない

未実装:

- **e2e matrixはCI上で未実行。** ローカルでYAMLの構文と各stepの内容は確認したが、GitHub Actions上で通ることは未検証
- Tauri matrix（`tauri build`のOS別ビルド）
- 実Tauriランタイムe2e（`npm run e2e:tauri`）のCI化。ubuntu runnerはxvfb + webkit2gtk-driverで動く見込みだが未検証
- Expo prebuild validation
- SBOM/license scan（#053）

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

## 066 [~] Save edits back into the PDF file on desktop

Labels: `platform:desktop`, `type:feature`, `priority:P0`

「少しコメントを書くだけ」で課金される体験を無くすための中核導線。編集がファイルに戻らなければ製品として成立しない。

実装済み:

- `tauri-plugin-fs` / `tauri-plugin-dialog`を追加し、capabilityを`fs:allow-read-file` / `write-file` / `copy-file` / `exists` + `dialog:default`に限定
- dialog経由で選択したpathのみruntime scopeに入る（plugin側が`allow_file`を呼ぶ）ため、静的scopeは空
- `apps/desktop/src/file-bridge.ts`: dialogでPDFを開き実pathを保持、save / save as
- `apps/desktop/src/use-pdf-file.ts`: `annotation.commit()`でannotationを確定してから`export.saveAsCopy()`のbytesをpathへ書く
- 上書き前に`<name>.iroha-original.pdf`を一度だけ作成し、最初に開いたbytesを常に復元可能にする
- browser mode（`dev:desktop:web`）ではTauri APIが無いためdownloadへfallback

検証済み（`npm run e2e`、#056のstub経由）:

- 注釈が保存後のPDFの`/Annots`に実在する（`Square`）
- 表の罫線とセル文字、透過PNG、CJK埋め込みフォント、page数が保存後も保持される。`pdftotext`の出力が保存前後で完全一致
- 初回上書きで`<name>.iroha-original.pdf`が作られ、SHA-256が元fileと一致する
- 2回目以降の保存でbackupが上書きされない
- save asが元fileを変更しない。dialogキャンセルで何も書かれない
- 41.6 MBの画像主体PDFでも注釈・保存が通り、出力が元の80%未満に縮まない

実ランタイム検証済み（`npm run e2e:tauri`、#056）:

- 本番のWebKitGTK webviewで開く・注釈する・保存するが通る
- 実ディスクのfileが36451→39017 bytesに変わり、`complex.iroha-original.pdf`が元のSHA-256のまま残る
- capability拒否がRust側で本当に効く（スコープ外のread/write、未付与の`fs.remove`をすべて拒否）

未実装・未検証:

- **dialog経由でのscope付与そのものは人手でしか確認できない。** Wayland/portalのdialogを駆動する手段が無く、e2eは`IROHA_E2E_SCOPE`（`debug_assertions`限定）で同等のscopeを与えている。plugin側が`allow_file`を呼ぶ実装は`tauri-plugin-dialog`の`commands.rs`で確認済みだが、実行時の証跡は無い。
- 上書き保存の確認dialogが無い（現状は無言で上書きし、backupだけ残す）
- 保存失敗時の扱いがtoolbarの文字列表示のみ
- Preview/Acrobatなど他ビューアでの目視確認
- mobileは未対応（#038のprovider bridgeが前提）

Acceptance: 実機でPDFを開き、注釈し、保存し、Preview/Acrobatで開いて注釈が同じ位置に見える。`<name>.iroha-original.pdf`のSHA-256が最初に開いたfileと一致する。

## 067 [~] Show PDF edit history

Labels: `type:feature`, `priority:P1`

historyプラグインはundo/redoを持つが過去の編集を一覧する口が無いため、`apps/desktop/src/document-store.ts`で自前に積む。

他エンジン検証済み: poppler と Ghostscript がどちらも描画位置±18px以内に注釈を描く。編集せず保存し直した場合はレンダリング結果がピクセル単位で完全一致し、保存経路がページを劣化させないことを確認済み。

実装済み:

- annotationのcreate/update/deleteをtimestamp・種別・page番号付きで記録
- 保存ごとにrevision（時刻、path、byte数、編集件数、save/save-as別）を記録
- side panelをEdit history / Noteのtab構成にし、新しい順で表示
- pathをkeyにlocalStorageへ永続化するため、閉じて開き直しても履歴が残る
- edits 500件 / revisions 100件でcap
- unit test 9件（`document-store.test.ts`）

未実装:

- **revisionからの復元ができない。** 記録はmetadataのみで、過去bytesは保持していない。復元できるのは`<name>.iroha-original.pdf`（最初の1版）のみ。
- 履歴からのdiff表示、特定編集へのjump
- localStorage依存のため、storageを消すと履歴も消える

Acceptance: 注釈して保存し、tabを閉じて開き直しても履歴が残る。任意のrevisionへ戻せる。
