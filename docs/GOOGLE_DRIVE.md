# Google Drive integration

## Current implementation status

実装済みなのは、最小権限scopeを使うRESTクライアント、ページング、ダウンロード、再開可能アップロードのクライアント処理、appData repository、Changes API処理、およびモバイルのサインイン・一覧・ダウンロード画面です。

一般ユーザー向け機能としては未完成です。Google Cloud / OAuth client、production consent screen、署名証明書との紐付け、実アカウント試験は未実施です。モバイル画面にはログアウトとGoogle権限取り消しを実装しましたが、本番アカウントでの検証は未完了です。モバイル画面からのアップロード、継続的な端末間同期、オフラインキュー、競合解決UI、Drive上のデータ削除は未完成です。以下のFile sync、Changes API、Conflict rulesは完成済みUIの説明ではなく、実装を完了させるためのプロトコル設計です。

## 権限

使用するscopeは次の2つです。

- `https://www.googleapis.com/auth/drive.file`
- `https://www.googleapis.com/auth/drive.appdata`

Google公式では`drive.file`は推奨されるnon-sensitive scopeで、アプリが作成したファイル、またはユーザーがアプリに明示的に渡したファイルへ限定されます。`drive.appdata`もnon-sensitiveで、ユーザーに見せないアプリ固有データを保存できます。

- [Choose Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Store application-specific data](https://developers.google.com/workspace/drive/api/guides/appdata)

## なぜ全Driveアクセスを要求しないか

`drive.readonly`や`drive`はrestricted scopeで、OAuth verificationと場合によってはsecurity assessmentが必要です。MVPでは要求しません。

`drive.file`ではDrive全体の任意PDF一覧は見えません。既存PDFは次のいずれかで明示的に選択させます。

1. OSのDocument Provider / Filesアプリから「Iroha PDFで開く」
2. Google Pickerによる選択
3. Iroha PDFが作成・アップロードしたファイル

## Cloud setup

1. Google Cloud projectを作成
2. Google Drive APIを有効化
3. OAuth consent screenを設定
4. Android OAuth clientをpackage name + SHA-1で作成
5. iOS OAuth clientをbundle identifierで作成
6. Web OAuth clientを作成
7. development buildへclient IDとreversed client IDを設定
8. test usersでsign-in、download、update、revokeを実機確認

## File sync

PDF本体は通常のDrive fileとして保存します。アプリ固有データは`appDataFolder`へ保存します。

```text
My Drive/
  user-selected.pdf

appDataFolder/
  manifest-v1.json
  operations-<device>-<sequence>.json
  cursor.json
```

大きいPDFはresumable uploadを使います。公式仕様では`uploadType=resumable`でsessionを作り、返されたLocationへcontentをPUTします。

- [Upload file data](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
- [Drive API v3](https://developers.google.com/workspace/drive/api/reference/rest/v3)

## Changes API

1. 初回に`changes.getStartPageToken`
2. tokenをappDataFolderとlocal DBへ保存
3. foreground復帰時に`changes.list`
4. `nextPageToken`がある間は繰り返す
5. 最後に`newStartPageToken`を保存

Push notificationはwebhook受信用backendが必要なのでP2です。モバイルアプリ単体ではforeground/BackgroundTask pollingを使います。

## Conflict rules

- remote versionがbase versionと同じ: update可
- remote versionが進んでいる: download → sidecar merge → user確認
- PDF binaryが両方変更: `filename (conflict device date).pdf`として両方保存
- annotation op: operation IDで集合和
- note: MVPはlogical clock、将来Yjs
- delete: tombstoneを30日保持

## Security

- refresh tokenや認証情報をSQLiteへ平文保存しない
- mobileはGoogle Sign-In SDKとKeychain/Keystore
- desktopはsystem browser + PKCE + OS credential vault
- access tokenをログへ出さない
- Drive response bodyを本番ログへ出さない
- sign-out時にlocal tokenと一時cacheを削除
