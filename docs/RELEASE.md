# 公開手順

Iroha PDFを外へ出す経路は3つあります。この文書は、それぞれを「どこを開いて、何をするか」の順に並べた手順書です。迷ったら、まず下のリンク集から目的の場所へ飛んでください。

## すぐ飛べるリンク

| やること | 開く場所 |
|---|---|
| リリースを実行する | [Release workflow](https://github.com/hjosugi/iroha-pdf/actions/workflows/release.yml) → **Run workflow** |
| `main`のCIが緑か確かめる | [CIの実行履歴（main）](https://github.com/hjosugi/iroha-pdf/actions/workflows/ci.yml?query=branch%3Amain) |
| 公開されたものを見る | [最新リリース](https://github.com/hjosugi/iroha-pdf/releases/latest) · [リリース一覧](https://github.com/hjosugi/iroha-pdf/releases) |
| PRを出す・確認する | [新しいPR](https://github.com/hjosugi/iroha-pdf/compare) · [PR一覧](https://github.com/hjosugi/iroha-pdf/pulls) |
| サイトを公開し直す | [Pages workflow](https://github.com/hjosugi/iroha-pdf/actions/workflows/pages.yml) · [Pagesの設定](https://github.com/hjosugi/iroha-pdf/settings/pages) |
| 公開中のサイトを見る | [トップ](https://hjosugi.github.io/iroha-pdf/) · [プライバシーポリシー](https://hjosugi.github.io/iroha-pdf/privacy/) |
| 正式リリースを止めているものを見る | [Release gate](RELEASE_GATE.md) · [#64 署名](https://github.com/hjosugi/iroha-pdf/issues/64) · [#63 EAS](https://github.com/hjosugi/iroha-pdf/issues/63) · [#67 ストア申告](https://github.com/hjosugi/iroha-pdf/issues/67) · [#69 実機ゲート](https://github.com/hjosugi/iroha-pdf/issues/69) |
| ストアの管理画面を開く | [App Store Connect](https://appstoreconnect.apple.com/apps) · [Google Play Console](https://play.google.com/console) · [Expo (EAS)](https://expo.dev/) · [Google Cloudの認証情報](https://console.cloud.google.com/apis/credentials) |

## 公開先の全体像

| 公開先 | 出るもの | きっかけ | いまの状態 |
|---|---|---|---|
| [GitHub Releases](https://github.com/hjosugi/iroha-pdf/releases) | デスクトップのインストーラ6種と`SHA256SUMS` | Release workflowを手で実行 | 稼働中。パッケージは未署名（[#64](https://github.com/hjosugi/iroha-pdf/issues/64)） |
| [GitHub Pages](https://hjosugi.github.io/iroha-pdf/) | このドキュメントサイトとプライバシーポリシー | `main`へのpushで自動 | 稼働中 |
| App Store / Google Play | モバイルアプリ | EASでビルドして提出 | 未実施。資格情報待ち |

[Soar](https://soar.qaidvoid.dev/)はGitHub Releasesを見に行くだけなので、Soar向けの公開作業はありません。

## デスクトップ版をリリースする

流れは「バージョンを上げるPRを`main`へ入れる → CIが緑になるのを待つ → Release workflowを実行する」の3段です。CIは25分前後、Release workflowは5〜10分で終わります（2026年11月の実績）。

### 1. バージョンを上げる

バージョンは`X.Y.Z`の3つ組です。次の6か所が同じ値でないと、Release workflowは最初のジョブで止まります。

| ファイル | 書き換える場所 |
|---|---|
| [`package.json`](../package.json) | `version` |
| [`apps/desktop/package.json`](../apps/desktop/package.json) | `version` |
| [`apps/mobile/package.json`](../apps/mobile/package.json) | `version` |
| [`apps/desktop/src-tauri/tauri.conf.json`](../apps/desktop/src-tauri/tauri.conf.json) | `version` |
| [`apps/desktop/src-tauri/Cargo.toml`](../apps/desktop/src-tauri/Cargo.toml) | `[package]`の`version` |
| [`apps/mobile/app.json`](../apps/mobile/app.json) | `expo.version` |

上の3つと`package-lock.json`は、コマンド1つで揃います。

```bash
VERSION=0.12.0   # 例。これから出す番号に置き換える

npm version "$VERSION" --no-git-tag-version --ignore-scripts \
  --workspace @iroha-pdf/desktop --workspace @iroha-pdf/mobile --include-workspace-root
```

下の3つはエディタで書き換え、そのあと`Cargo.lock`を追従させます。

```bash
(cd apps/desktop/src-tauri && cargo update --workspace --offline)
```

6か所が揃ったことを確かめます。すべて同じ番号が出れば合っています。

```bash
grep -n '"version"' package.json apps/desktop/package.json apps/mobile/package.json \
  apps/desktop/src-tauri/tauri.conf.json apps/mobile/app.json
grep -n -m1 '^version' apps/desktop/src-tauri/Cargo.toml
```

インストール手順に書いてあるファイル名とURLも、番号を含んでいます。ひとつ前の番号で検索して書き換えます。

```bash
git grep -n '0\.11\.0' -- README.md README.en.md docs/BUILD.md   # ひとつ前の番号で探す
```

### 2. 変更履歴に節を足す

[`CHANGELOG.md`](../CHANGELOG.md)の先頭に、次の形の見出しで節を足します。日付は`YYYY-MM-DD`です。

```text
## 0.12.0 - 2026-12-01
```

Release workflowはこの見出しを探し、次の`## `までをそのままリリースノートにします。見出しの形が違うと検証で止まります。パッケージが未署名であることと`SHA256SUMS`の使い方は、workflowがノートの末尾へ自動で足します。

### 3. PRを出して`main`へ入れる

```bash
git switch -c "release-$VERSION"
git commit -am "release: $VERSION"
git push -u origin "release-$VERSION"
gh pr create --fill
gh pr checks --watch
gh pr merge --squash --delete-branch
```

`main`は保護されていて、[必須チェック8件](MAIN_BRANCH_PROTECTION.md)が緑になるまでマージできません。

### 4. `main`のCIが緑になるのを待つ

Release workflowは、リリースするコミットそのものに対して必須チェック8件が成功していることを確かめます。見るのはPRのチェックではなく、マージしてできた`main`のコミットに対する実行です。

[CIの実行履歴（main）](https://github.com/hjosugi/iroha-pdf/actions/workflows/ci.yml?query=branch%3Amain)のいちばん上が緑になるまで待ちます。コマンドなら次のとおりです。

```bash
gh run list --workflow ci.yml --branch main --limit 1   # いまの状態を見る
gh run watch                                             # 実行中のものを選んで、終わるまで待つ
```

### 5. Release workflowを実行する

[Release workflow](https://github.com/hjosugi/iroha-pdf/actions/workflows/release.yml)を開き、**Run workflow**を押して次のとおり入力します。

| 入力欄 | 入れる値 |
|---|---|
| Use workflow from | `main` |
| Version to release | `0.12.0`のように、先頭の`v`なしで |
| Mark as a pre-release | 下の説明を読んで選ぶ |

`Mark as a pre-release`は最初からオンになっていて、入力欄の説明も「Release gateがblockedの間はオンのまま」と勧めています。ただしオンのまま出すと、GitHubはその版を「最新リリース」として扱いません。READMEとこのサイトのダウンロードリンクは[`/releases/latest`](https://github.com/hjosugi/iroha-pdf/releases/latest)を指しているので、新しい版がそこに出てこなくなります。v0.5.0以降はオフにして公開しています。

コマンドでも同じことができます。

```bash
gh workflow run release.yml --ref main -f version="$VERSION" -f prerelease=false
gh run watch   # 実行中のReleaseを選んで、終わるまで待つ
```

workflowは3つのジョブを順に進めます。タグができるのは最後の一手なので、途中で失敗しても何も公開されません。直して同じ番号でもう一度実行できます。

| ジョブ | やること | 失敗したとき |
|---|---|---|
| Verify | バージョン6か所と変更履歴の見出しが揃っていること、必須チェック8件の成功、同じ番号のリリースやタグがないことを確かめる | 何も作られていない |
| Bundle（3つのOS） | Linux、macOS、Windowsでインストーラをビルドする | 何も作られていない |
| Tag and publish | `SHA256SUMS`を作り、下書きリリースへ全ファイルを添付し、添付を照合してから公開する。公開した時点でタグができる | 下書きは自動で消える。タグはできていない |

細部は[`.github/workflows/release.yml`](../.github/workflows/release.yml)のコメントに書いてあります。

### 6. 公開されたものを確かめる

1. [最新リリース](https://github.com/hjosugi/iroha-pdf/releases/latest)が新しい番号になっている。
2. 添付が7つある: `.AppImage`、`.deb`、`.rpm`、`.dmg`、`.msi`、`-setup.exe`、`SHA256SUMS`。
3. ダウンロードしたファイルが`SHA256SUMS`と一致する。
4. 自分のOS向けのパッケージを入れて、起動するところまで確かめる。

3は次のコマンドで確かめられます。

```bash
gh release download "v$VERSION" --dir "/tmp/iroha-$VERSION" \
  --pattern '*.AppImage' --pattern SHA256SUMS
(cd "/tmp/iroha-$VERSION" && sha256sum --check --ignore-missing SHA256SUMS)
```

### うまくいかないとき

| 出るメッセージや状況 | 原因と対処 |
|---|---|
| `declares 0.11.0, expected 0.12.0` | 書き換え忘れたファイルがある。手順1の確認コマンドで探す |
| `no '## 0.12.0 - YYYY-MM-DD' heading` | 変更履歴の見出しがないか、形が違う |
| `required check '…' is missing`、`still in_progress`、`failure` | `main`のCIが終わっていないか、失敗している。緑にしてから実行し直す |
| `v0.12.0 is already released`、`tag v0.12.0 already exists` | 同じ番号では出し直せない。番号を上げる |
| `the release would be missing *.dmg`など | どれかのOSでパッケージができていない。Bundleジョブのログを見る |
| 公開したあとで問題が見つかった | リリースやタグを消して作り直さず、直した版を次の番号で出す |

## ドキュメントサイトを公開する

操作は要りません。`main`へpushされるたびに[Pages workflow](https://github.com/hjosugi/iroha-pdf/actions/workflows/pages.yml)が`docs/`とリポジトリ直下のMarkdownからサイトを作り直します。リンク切れ、存在しないアンカー、外部から読み込むリソースがあれば、公開の前に止まります。

| やりたいこと | 方法 |
|---|---|
| 公開前に手元で見る | `npm run site`のあと、`python3 -m http.server --directory site/dist`などで`site/dist/`を配信する |
| 公開前と同じ検査をする | `npm run validate:site` |
| ページを足す | [`site/catalog.mjs`](../site/catalog.mjs)の`SECTIONS`に1件足す |
| 手で公開し直す | [Pages workflow](https://github.com/hjosugi/iroha-pdf/actions/workflows/pages.yml) → **Run workflow** |
| Pagesを有効にする（初回だけ） | [Pagesの設定](https://github.com/hjosugi/iroha-pdf/settings/pages)で、Sourceを**GitHub Actions**にする |

`/privacy/`のURLは、App Store Connect、Play Console、OAuth同意画面に入力する値です。動かすと検査が失敗するようにしてあります。理由は[Store privacy checklist](STORE_PRIVACY_CHECKLIST.md)にあります。

## モバイル版をストアへ出す

まだ一度も実施していません。EASプロジェクトの初期化、署名用の資格情報、ストアでの申告が残っています（[#63](https://github.com/hjosugi/iroha-pdf/issues/63)、[#67](https://github.com/hjosugi/iroha-pdf/issues/67)、[#69](https://github.com/hjosugi/iroha-pdf/issues/69)）。資格情報が揃ったら、次の順に進めます。コマンドはすべて`apps/mobile`で実行し、細部は各行のリンク先に従います。

1. **EASを準備する。** `npx eas-cli@20.5.1 init`でプロジェクトを作り、`credentials`で署名鍵を登録します。鍵、証明書、`credentials.json`はコミットしません。手順は[Mobile release runbook](../release/mobile/README.md)にあります。
2. **previewビルドで確かめる。** `eas build --profile preview --platform android`と`--platform ios`を実行し、リリースするコミットを実機で試します。
3. **productionビルドを作る。** `eas build --profile production --platform android`と`--platform ios`を実行します。ストア用のビルド番号はEASが自動で上げます。
4. **ストアへ提出する。** `eas submit --profile production --id <build-id>`で、確認を済ませたビルドIDだけを出します。
5. **掲載情報を入力する。** 文面とスクリーンショットは[`release/store/`](../release/store/README.md)にあり、`npm run validate:store`で検査しています。これを[App Store Connect](https://appstoreconnect.apple.com/apps)と[Google Play Console](https://play.google.com/console)へ入力します。
6. **プライバシーの申告を済ませる。** [Store privacy checklist](STORE_PRIVACY_CHECKLIST.md)の未チェック項目を埋めます。ポリシーのURLは https://hjosugi.github.io/iroha-pdf/privacy/ です。
7. **Google Driveを有効にする。** [Google Cloudの認証情報](https://console.cloud.google.com/apis/credentials)でOAuthクライアントを作ります。手順は[Google Drive integration](GOOGLE_DRIVE.md)にあります。

ストアへ出したあとの差し戻し方も、[Mobile release runbook](../release/mobile/README.md)の「Rollback drill」にあります。

## 「正式リリース」と言えるまで

いま出しているのは、未署名のエンジニアリングプレビューです。正式リリースと言えるかどうかは[Release gate](RELEASE_GATE.md)が決め、現在は**blocked**です。残っている証跡は、大きく次の3つに分かれます。行ごとの内訳はRelease gateの表に従います。

- デスクトップパッケージの署名とnotarization（[#64](https://github.com/hjosugi/iroha-pdf/issues/64)）
- 実機での起動時間、大きなPDF、電池、印刷、スタイラスの証跡（[#69](https://github.com/hjosugi/iroha-pdf/issues/69)）
- ストアのプライバシー申告と審査（[#67](https://github.com/hjosugi/iroha-pdf/issues/67)）
