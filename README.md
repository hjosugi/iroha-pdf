# Iroha PDF

軽量・ローカルファーストのPDFワークスペースです。iOS / AndroidとWindows / macOS / Linux向けのUIから、PDF操作、注釈、メモ、同期用データモデルを共有します。

`Iroha PDF` は、モバイルとデスクトップでPDFを端末内処理するオープンソースのエンジニアリングプレビューです。一般利用向けの署名、実機、性能、OAuth、ストア審査はまだ完了していません。

`abc-pdf` は既存の商用製品 ABCpdf と同名GitHubリポジトリに近いため採用せず、公開名を `Iroha PDF`、リポジトリ名を `iroha-pdf` としています。

## 現在のリリース状態

- 最新の公開版は`0.4.0`で、その後の改善は`Unreleased`です。デスクトップ成果物はGitHub Releaseにありますが、Windows署名とmacOS notarizationは未実装です。
- Android / iPhone / iPadのRelease構成はSimulator / Emulatorで起動・描画確認済みです。署名済みproduction buildを物理端末へ入れた証跡ではありません。
- App Store / Google Playの掲載文と画像はリポジトリ内で検証済みです。TestFlight、Play closed testing、ストア申告・審査は未実施です。
- Google DriveはRESTクライアントとモバイルの一覧・ダウンロード画面までです。production OAuth、アップロード、端末間同期、競合解決はリリース未検証です。
- 正式リリースの可否は[docs/RELEASE_GATE.md](docs/RELEASE_GATE.md)を正とします。現在は**blocked**です。

## 現在実装済み

- Expo SDK 57 / React Native 0.86 / React 19.2 / TypeScript 6のモバイル基盤
- Tauri 2 + React + EmbedPDF（PDFium/WASM）のデスクトップ基盤
- PDF表示、複数タブ、ハイライト、筆圧対応スタイラス手書き、テキスト注釈
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
- Google Driveモバイル画面（OAuthクライアント設定後の一覧・ダウンロード）
- 日本語・英語UI、スクリーンリーダー用ラベル、44pt以上のモバイル操作領域
- PDFページ実寸に正規化する注釈座標、回転時の再計算、編集時100%表示への安全な復帰
- 300 MiB・500ページPDFを1.5 GiB Android AVDでopen / trim / resume / cold reopenする証跡ゲート
- 端末内PDF・メモの削除、Google Driveのログアウト・権限取り消し
- 注釈座標、PDF操作、同期マージの単体テスト

## 重要な制限

- 「既存テキストの直接置換」はPDFの最低限編集には含めていません。フォント、文字配置、サブセット、Content Streamの再構築が必要で、壊れやすいためです。MVPは追記、ハイライト、手書き、メモ、ページ操作を扱います。
- モバイルの安全な最適化はObject Stream再構成のみです。画像の再圧縮を行わないため、縮まないPDFもあります。
- モバイルの注釈書き出し/印刷はPDF全体をJavaScriptメモリで再構成するため、64 MiBを超える入力では強制終了を避けてdesktop利用を案内します。native閲覧と注釈autosaveは継続できます。
- 高圧縮、deskew、OCR、PDF/A、フォントアウトライン化はネイティブエンジンが必要です。デスクトップはpdfcpu sidecar、モバイルは専用ネイティブモジュールとしてIssue化しています。
- Google Drive認証にはGoogle Cloud ConsoleでiOS、Android、Web OAuthクライアントを作成し、development buildを再生成する必要があります。
- Driveのアップロード、端末間同期、オフラインキュー、PDF競合解決UIは完成していません。
- モバイルPDF表示は`react-native-pdf`を使うためExpo Goでは動きません。development buildを使用してください。
- Androidエミュレータでは合成スタイラス入力と低メモリ試験を行いますが、物理iPhone / iPad / AndroidでのApple Pencil・各社ペン、印刷、回転、電池、OSによるprocess kill後の復旧は未検証です。
- デスクトップ配布物は未署名です。Gatekeeper / SmartScreenの警告を回避できる一般向けリリースではありません。

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
site/
  build.mjs        docs/をGitHub Pagesへ公開する依存なしの生成器
issues/
  ISSUES.md
```

## ドキュメント

`docs/`はGitHub Pagesへ公開しています。`main`へのpushごとに[.github/workflows/pages.yml](.github/workflows/pages.yml)が再生成します。

- サイト: https://hjosugi.github.io/iroha-pdf/
- プライバシーポリシー（ストアとOAuth同意画面へ入力する安定URL）: https://hjosugi.github.io/iroha-pdf/privacy/
- App Store / Google Play提出文、画像、再生成手順: [release/store/README.md](release/store/README.md)
- 画面別UI/UX監査、修正内容、残る実機ゲート: [docs/UI_UX_AUDIT.md](docs/UI_UX_AUDIT.md)

ローカルで生成して確認する場合は`npm run site`を実行し、`site/dist/`を静的配信してください。公開URLと提出時の確認項目は[docs/STORE_PRIVACY_CHECKLIST.md](docs/STORE_PRIVACY_CHECKLIST.md)を参照してください。

## セットアップ

前提はNode.js 22.13以降とFrostBuild v0.8.0です。Taskfileは廃止し、ローカルとCIの増分テスト・型検査・検証・デスクトップビルドを`frost.toml`へ一本化しています。デスクトップのネイティブビルドにはRustとTauriのOS別前提ソフトウェアも必要です。

```bash
npm ci
frost test --all --no-tui
frost build desktop-web --no-tui
```

ツールの固定バージョン、インストール方法、npmとの責務分担は[docs/BUILD.md](docs/BUILD.md)を参照してください。

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

[issues/ISSUES.md](issues/ISSUES.md)は初期バックログと検証記録のリポジトリ内ミラーです。現在の状態と優先度は[GitHub Issues](https://github.com/hjosugi/iroha-pdf/issues)を確認し、`P0`から進めてください。

## 主要な技術判断

- React Native公式は新規アプリでExpoのようなFrameworkを推奨しており、Expo SDK 57はReact Native 0.86を採用しています。
- デスクトップPDFエンジンは、MITライセンス、PDFium、注釈・印刷・export pluginを持つEmbedPDFを採用しました。
- PedaruはGoogle Drive、SQLite、タブ、セッション設計の参考にしましたが、デスクトップ専用でPDF書き込み機能がないため移植していません。
- BentoPDFは機能要件の参考として非常に優秀ですが、AGPL-3.0 / 商用デュアルライセンスです。このプロジェクトにはコードをコピーしていません。

## License

Apache-2.0。第三者コンポーネントは[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)を参照してください。
