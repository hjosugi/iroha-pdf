# Iroha PDF

軽量・ローカルファーストのPDFワークスペースです。iOS / Android / Windows / macOS / Linuxで、PDF、注釈、メモ、タブ、印刷、Google Drive同期を同じデータモデルで扱います。

`Iroha PDF` は、ローカルファーストでモバイルとデスクトップをシームレスにつなぐオープンソースPDFワークスペースです。

`abc-pdf` は既存の商用製品 ABCpdf と同名GitHubリポジトリに近いため採用せず、公開名を `Iroha PDF`、リポジトリ名を `iroha-pdf` としています。

## 現在実装済み

- Expo SDK 57 / React Native 0.86 / React 19.2 / TypeScript 6のモバイル基盤
- Tauri 2 + React + EmbedPDF（PDFium/WASM）のデスクトップ基盤
- PDF表示、複数タブ、ハイライト、手書き、テキスト注釈
- PDFごとの軽量メモと自動保存
- 注釈をPDFへ焼き込んだコピーの書き出し
- 画像からPDF作成（大画像縮小、JPEG圧縮、A4配置）
- PDFページ並べ替え・複製・結合・抽出・削除・回転
- iOS / Androidのネイティブ印刷ダイアログ
- PDF構造の安全な最適化
- SQLiteによるPDF、メモ、注釈の永続化
- Google Drive RESTクライアント
  - `drive.file` / `drive.appdata` の最小権限
  - PDF一覧、ダウンロード、作成・更新、再開可能アップロード
  - Changes APIの開始トークンと差分取得
- Google Driveモバイル画面（OAuthクライアント設定後に利用可能）
- 注釈座標、PDF操作、同期マージの単体テスト

## 重要な制限

- 「既存テキストの直接置換」はPDFの最低限編集には含めていません。フォント、文字配置、サブセット、Content Streamの再構築が必要で、壊れやすいためです。MVPは追記、ハイライト、手書き、メモ、ページ操作を扱います。
- モバイルの安全な最適化はObject Stream再構成のみです。画像の再圧縮を行わないため、縮まないPDFもあります。
- 高圧縮、deskew、OCR、PDF/A、フォントアウトライン化はネイティブエンジンが必要です。デスクトップはpdfcpu sidecar、モバイルは専用ネイティブモジュールとしてIssue化しています。
- Google Drive認証にはGoogle Cloud ConsoleでiOS、Android、Web OAuthクライアントを作成し、development buildを再生成する必要があります。
- モバイルPDF表示は`react-native-pdf`を使うためExpo Goでは動きません。development buildを使用してください。

## 構成

```text
apps/
  mobile/          Expo / React Native
  desktop/         Tauri / React / EmbedPDF
packages/
  core/            PDF操作、注釈、同期ドメイン
  google-drive/    Google Drive APIクライアント
docs/
  ARCHITECTURE.md
  GOOGLE_DRIVE.md
  REPOSITORY_RESEARCH.md
  TEST_PLAN.md
issues/
  ISSUES.md
```

## セットアップ

前提はNode.js 22.13以降です。デスクトップのネイティブビルドにはRustとTauriのOS別前提ソフトウェアも必要です。

```bash
npm install
npm test
npm run typecheck
```

### モバイル

```bash
npm run dev:mobile
```

初回はdevelopment buildを作ります。

```bash
cd apps/mobile
npx expo prebuild
npx expo run:android
# macOSの場合のみ
npx expo run:ios
```

### デスクトップWeb UI

```bash
npm run dev:desktop:web
```

### Tauriデスクトップ

```bash
npm run dev:desktop
```

## Google Drive設定

```bash
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

詳細は[docs/GOOGLE_DRIVE.md](docs/GOOGLE_DRIVE.md)を参照してください。

## 実装の続き

[issues/ISSUES.md](issues/ISSUES.md)はGitHub Issueへそのまま転記できる形式です。`P0`から順に進めてください。

## 主要な技術判断

- React Native公式は新規アプリでExpoのようなFrameworkを推奨しており、Expo SDK 57はReact Native 0.86を採用しています。
- デスクトップPDFエンジンは、MITライセンス、PDFium、注釈・印刷・export pluginを持つEmbedPDFを採用しました。
- PedaruはGoogle Drive、SQLite、タブ、セッション設計の参考にしましたが、デスクトップ専用でPDF書き込み機能がないため移植していません。
- BentoPDFは機能要件の参考として非常に優秀ですが、AGPL-3.0 / 商用デュアルライセンスです。このプロジェクトにはコードをコピーしていません。

## License

Apache-2.0。第三者コンポーネントは[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)を参照してください。
