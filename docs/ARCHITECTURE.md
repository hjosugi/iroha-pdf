# Architecture

## 結論

単一UIコードを全プラットフォームへ無理に流用せず、PDFレンダラーだけをプラットフォーム別にし、ドメイン、ファイル操作、注釈形式、同期プロトコルを共有します。

```text
                 Google Drive
          PDFs + hidden appDataFolder
                       |
              Provider adapter
                       |
       shared sync operations / conflicts
                       |
        +--------------+--------------+
        |                             |
 Expo mobile                    Tauri desktop
 react-native-pdf               EmbedPDF/PDFium
 Expo SQLite                    local metadata
        |                             |
        +------- @iroha-pdf/core -----+
             pdf-lib + domain model
```

## Apps

### Mobile

- Expo SDK 57 / React Native 0.86.2 / React 19.2.3
- Expo Router
- `react-native-pdf`で単一ページ表示
- React Native SVGの注釈オーバーレイ（固定した`react-native-pdf` patchが
  ページ変更ごとに返す実寸へfitし、混在サイズPDFでも再計算）
- React Native pointer eventでpen/touch/mouseを分離し、penの各点のpressureを保持。
  AndroidはExpo config pluginが起動前にReact Native 0.86のpointer dispatcherを有効化し、
  dependency patchが`MotionEvent`の実pressureを固定0.5へ置換せずbridgeへ渡す。
  同pluginがpatched React AndroidをGradle composite buildへ追加し、`ReactAndroid`と
  `hermes-engine` projectをそれぞれ`react-android`と`hermes-android`へ明示的に
  dependency substitutionする。native moduleがまだ要求するlegacy `react-native`と
  `hermes-engine`座標も同じsource projectへ吸収するため、修正はprecompiled AARではなく
  実APKへ入り、ソース版と公開AARの二重クラスも防ぐ。clean prebuild、installed
  Kotlin source、生成Gradle設定と両方の`dependencyInsight`結果をCIで検査する
- `expo-sqlite`で文書、メモ、注釈を保存
- `expo-document-picker`でFilesアプリと端末Document Providerから取り込み
- `expo-print`でPDF URIをネイティブ印刷
- `expo-image-picker` + `expo-image-manipulator` + `pdf-lib`で画像→PDF

### Desktop

- Tauri 2
- React 19.2.8
- EmbedPDF + PDFium/WASM
- PDF表示、選択、注釈、export、printをpluginとして構成
- 右ペインにPDF連動メモ

## Shared packages

### `@iroha-pdf/core`

- 正規化座標`0..1`の注釈モデル
- 画像→PDF
- ページ並べ替え、複製、回転
- 注釈のFlatten export
- Object Streamを使った安全な構造最適化
- append-only同期操作とlogical clock
- 日英の型付きメッセージcatalog（下記）

### `@iroha-pdf/google-drive`

- Token providerを注入する純粋なRESTクライアント
- モバイルとデスクトップでOAuth UIだけを差し替え
- 小さいファイルでもresumable uploadを使い、同じコードパスに統一
- `appDataFolder`に同期操作、cursor、設定を保存

## Localization

日本語と英語の2言語です。catalogは`packages/core/src/i18n.ts`に1つだけ置き、両言語を横に並べて持ちます。片方だけ追加することが型として不可能で、存在しないkeyは呼び出し側のcompile errorになります。

i18nライブラリは使いません。要件は「2つのlocaleから1つ選んで文字列を引く」だけで、plural rule、lazy namespace読み込み、ICU parseを持つ依存を全platformが背負う理由がありません。

localeはOS/端末の言語から起動時に1度だけ解決します。切り替えはOSの設定であり、変わればwebviewもbrowserも再読み込みするため、動かない値のためにReact contextを用意しません。desktopは`<html lang>`も設定します（screen reader、hyphenation、CJK fallback fontがこれを見ます）。

日時だけは意図的にapp localeではなくplatform localeで整形します。アプリは2言語ですが、機械が日付をどう書くかはその機械の設定であり、日本語環境で英語UIを読んでいる人も日付は自分の形式を期待します。

**永続化するデータに表示文字列を入れません。** 保存するのは識別子で、名前はcatalogから表示時に引きます。編集履歴（#101）がこれを破っていた実例です — 注釈の種別を英語名のまま`localStorage`へ書いていたため、記録した時点の言語に履歴が固定されていました。catalogを訳しても既存の履歴は英語のままで、しかも時期ごとに言語が混ざります。現在は`AnnotationKind`という識別子を保存し、旧版が書いた英語名は読み込み時に識別子へ読み替えます。

## Annotation strategy

編集途中はPDF本体を変更しません。現在のモバイル実装は注釈をSQLiteに保存し、表示時に重ねます。Drive sidecarは同期目標モデルであり、現在の画面からは書き込みません。ユーザーがExportまたはPrintを選んだ時だけPDFへ焼き込みます。

利点:

- autosaveが軽い
- PDF binary conflictを避けられる
- undo/redoと複数端末マージが容易
- 元PDFを壊さない

座標は左上原点の正規化座標です。PDFへ焼き込む時だけ、左下原点のPDF座標へ変換します。inkはpointと同数の任意`pressures`配列を持ち、旧データやtouch/mouse入力は従来どおり一定線幅です。pen入力だけはpressureを0.55〜1.45倍の線幅へ写像し、画面previewとflatten exportで同じ関数を使います。

モバイルのflatten exportは`pdf-lib`が入力、parsed object graph、出力をJS heapへ同時に保持します。native rendererによる閲覧上限とは別物なので、64 MiBを超える入力はmobileでExport/Printせずdesktopへ案内します。これは「大容量PDFを開ける」という性質を失わず、書き出し中の強制終了だけを避ける境界です。

## Sync model

以下は同期プロトコルの目標モデルです。共有型、Drive RESTクライアント、appData用repository、Changes API取得処理は実装済みですが、production OAuth、永続オフラインキュー、モバイル/デスクトップ間の連続同期、PDF競合解決UIは未完成です。現在のモバイル画面が行うのはapp-visible PDFの一覧と端末へのダウンロードまでです。

同期対象はPDF binary、annotation operations、notes、tabs、document metadataです。

- PDF binary: Drive file ID + versionで管理。競合時は自動上書きしない。
- Annotation: ID付きoperationの集合和。deleteはtombstone。
- Notes: MVPはlogical clockによるLWW。P1でYjs updateへ移行。
- Tabs: device localを基本とし、「他の端末から続ける」用のrecent stateだけ同期。
- Cursor: Drive Changes APIのpage tokenを保存。

## Compression levels

| Level | Mobile | Desktop | Behavior |
|---|---|---|---|
| Safe | 実装済み | 実装可能 | PDF構造再保存。テキスト・リンク・画像を保持 |
| Balanced | Issue | pdfcpu sidecar | 未使用object削除、画像最適化、structure optimization |
| Smallest | Issue | Ghostscript optional | 画像downsample。透明、色、font、PDF/Aに注意 |
| Raster print | Issue | Issue | ページを画像化。検索性・アクセシビリティを失う |

`Safe`を「圧縮」と誤表示しないでください。縮まない場合があります。

## Print optimization

印刷前に以下を選べる設計です。

- annotationsを含める / 除外
- page range
- original size / A4 / Letter
- fit / actual size
- grayscale
- image DPI 150 / 300
- flatten forms and annotations
- booklet / N-up（desktop P1）

## Why not one renderer

PDF.js/PDFium WASMをReact Native WebViewへ入れる案はUI共有率が高い一方、巨大PDFのメモリ、ファイル受け渡し、iOS WKWebView、Android WebView差異がボトルネックになります。モバイルはnative renderer、デスクトップはPDFium/WASMを使い、注釈形式だけ共有する方が安定します。
