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

- Expo SDK 57 / React Native 0.86
- Expo Router
- `react-native-pdf`で単一ページ表示
- React Native SVGの注釈オーバーレイ
- `expo-sqlite`で文書、メモ、注釈を保存
- `expo-document-picker`でFilesアプリと端末Document Providerから取り込み
- `expo-print`でPDF URIをネイティブ印刷
- `expo-image-picker` + `expo-image-manipulator` + `pdf-lib`で画像→PDF

### Desktop

- Tauri 2
- React 19
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

### `@iroha-pdf/google-drive`

- Token providerを注入する純粋なRESTクライアント
- モバイルとデスクトップでOAuth UIだけを差し替え
- 小さいファイルでもresumable uploadを使い、同じコードパスに統一
- `appDataFolder`に同期操作、cursor、設定を保存

## Annotation strategy

編集途中はPDF本体を変更しません。注釈はSQLiteとDrive sidecarに保存し、表示時に重ねます。ユーザーがExportまたはPrintを選んだ時だけPDFへ焼き込みます。

利点:

- autosaveが軽い
- PDF binary conflictを避けられる
- undo/redoと複数端末マージが容易
- 元PDFを壊さない

座標は左上原点の正規化座標です。PDFへ焼き込む時だけ、左下原点のPDF座標へ変換します。

## Sync model

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
