# Iroha PDF mobile

Expo SDK 57 / React Native 0.86.2 / React 19.2.3 / TypeScript 6.0.3のモバイルクライアントです。PDFの取り込み、表示、注釈、別コピーへの書き出し、ページ操作、メモ、端末内データの削除、ネイティブ印刷UIを実装しています。UIは端末言語に合わせて日本語または英語になります。

`react-native-pdf`とGoogle Sign-In native moduleを使うため、Expo Goではなくdevelopment buildが必要です。

現在の境界:

- Android / iPhone / iPadのRelease構成はCIのEmulator / Simulatorで起動・描画確認済みです。
- Androidは合成native stylus入力をpointer bridgeへ通し、点ごとの筆圧をSQLiteへ保存する自動試験を持ちます。これはApple Pencilや各社Android stylusの物理端末証跡ではありません。
- 300 MiB・500ページのPDFは1.5 GiB Android AVDでopen / critical trim / resume / cold reopenを試験します。閲覧と注釈autosaveはnative経路を使い、64 MiBを超えるmobileのflatten書き出し・印刷はJavaScript heap枯渇前にdesktop利用を案内します。
- 物理端末、署名済みproduction build、TestFlight / Play closed testingは未検証です。
- Google Drive画面はOAuth設定後の一覧とダウンロードまでです。アップロード、継続同期、競合解決は未完成です。
- Google Drive画面からログアウトと権限取り消しを選べますが、本番OAuthアカウントでの実機検証は未完了です。
- 開いた外部PDFそのものへの上書きはできません。注釈済みの別コピーを共有・保存します。

ローカル／CIのbuild入口はFrostBuild v0.8.0です。セットアップ、リリース状態、制約、Google Drive設定はリポジトリrootの`README.md`、`docs/BUILD.md`、`docs/RELEASE_GATE.md`を参照してください。
