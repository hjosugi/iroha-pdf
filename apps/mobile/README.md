# Iroha PDF mobile

Expo SDK 57 / React Native 0.86のモバイルクライアントです。PDFの取り込み、表示、注釈、別コピーへの書き出し、ページ操作、メモ、端末内データの削除、ネイティブ印刷UIを実装しています。UIは端末言語に合わせて日本語または英語になります。

`react-native-pdf`とGoogle Sign-In native moduleを使うため、Expo Goではなくdevelopment buildが必要です。

現在の境界:

- Android / iPhone / iPadのRelease構成はCIのEmulator / Simulatorで起動・描画確認済みです。
- 物理端末、署名済みproduction build、TestFlight / Play closed testingは未検証です。
- Google Drive画面はOAuth設定後の一覧とダウンロードまでです。アップロード、継続同期、競合解決は未完成です。
- Google Drive画面からログアウトと権限取り消しを選べますが、本番OAuthアカウントでの実機検証は未完了です。
- 開いた外部PDFそのものへの上書きはできません。注釈済みの別コピーを共有・保存します。

セットアップ、リリース状態、制約、Google Drive設定はリポジトリrootの`README.md`と`docs/RELEASE_GATE.md`を参照してください。
