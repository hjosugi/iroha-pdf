# UI / UX監査

最終更新: 2026-08-02

この文書は、READMEの機能一覧ではなく、通常ユーザーが触る画面を入口から終了まで確認した記録です。対象はExpoモバイルのライブラリ、PDFビューアー、メモ、PDFツール、Google Drive、復旧画面と、Tauriデスクトップのタブ、注釈、履歴、メモ、保存、印刷です。ストア用の合成画面だけを見て「実用可能」とは判定しません。

## 今回直したこと

| 領域 | 発見した問題 | 対応 |
|---|---|---|
| タブレット | phone用の行と文章がiPad幅いっぱいに伸び、視線移動が長かった | ライブラリ、メモ、PDFツール、Drive、復旧画面を中央の最大幅付きcolumnへ統一 |
| モバイル操作 | 44px未満の注釈・ページ操作があり、読み上げ名もほぼ無かった | 主要操作を44px以上にし、role、label、hint、selected/disabled stateを追加 |
| ライブラリ | PDFとメモをアプリ内から削除できなかった | 確認ダイアログ付き削除を追加。PDF削除時は端末内コピー、注釈、復旧記録を削除し、Files/Driveの原本は変更しない |
| 空・検索状態 | データが無い状態と検索結果0件が同じ表示だった | 初回案内と検索0件を分け、次にできる操作を表示 |
| 注釈 | SQLite保存より先に画面だけ更新する経路があり、保存失敗時に見かけと実データがずれ得た | 追加、削除、undo、redoは永続化成功後だけUIと履歴を更新 |
| 注釈座標 | PDFの実表示領域ではなくviewer全体へ座標を正規化し、余白・回転・zoomでずれ得た | native rendererが返すページ寸法から中央配置領域を計算。編集tool選択時は100%へ戻し、zoom中は誤配置を防ぐためoverlayを読取専用にする |
| スタイラス | touchとpenを同じPanResponder経路で扱い、筆圧を保存も書き出しもしていなかった | native pointer eventのpointer ID / tool type / pressureを取得し、各点の筆圧をSQLiteへ保存。画面previewとflatten済みPDFの双方で線幅へ反映する |
| 大容量PDF | native表示は可能でもmobile書き出しが全bytesをJS heapへ展開し、低メモリ時にOS終了し得た | 閲覧・注釈autosaveは維持し、64 MiB超のmobile書き出し/印刷は説明dialogからdesktopへ案内する。300 MiB/500ページ用のstreaming fixtureと1.5 GiB AVD gateも追加 |
| size規則 | CSSとReact Native StyleSheetに近い余白・文字・角丸・操作高が個別値で散在した | desktop/siteはCSS custom properties、mobileは`theme.ts`の型付きtokenへ統合。raw固定値を再導入するとFrostのstyle-token gateが失敗する |
| PDF読込 | 取得中、削除済み、破損PDFの表示が弱く、native errorをそのまま見せる経路があった | loading/not-found/retryを分離し、利用者向けエラーへ置換 |
| PDFツール | ページ指定が不正でも先にファイル選択を要求した | 入力を先に検証し、取り消しや無駄なpicker操作を減らした |
| Google Drive | OAuth未設定ビルドでも接続できそうに見え、切断手段が無かった | 未設定状態を明示。更新、ログアウト、権限取り消しを追加。ダウンロード後はライブラリを経由せず開く |
| 復旧 | 復旧コピーを1操作で破棄できた | 取り消せない破棄に確認を追加し、処理中の二重操作を無効化 |
| メモ | 読込中と削除済みが空白に見え、自動保存状態が不明だった | loading/not-found/autosave表示を追加 |
| 日英表示 | desktopの一部だけが翻訳され、mobileは英語固定だった | 1つの型付きcatalogを両UIで使い、端末/OS言語から日本語・英語を選択。新しい片言語だけのkeyは型検査で失敗する |
| desktopタブ | `button`の内側に擬似buttonがあり、HTML・キーボード操作が不正だった | タブ選択と閉じる操作を独立したbuttonにし、それぞれ読み上げ名を設定 |
| desktop狭幅 | 860px以下で履歴・メモpanelが消え、機能へ到達できなかった | viewer下へpanelを移し、狭幅でも履歴・メモを保持 |
| desktop toolbar | 幅不足で操作が画面外へ切れ、キーボードfocusが見えなかった | 横スクロール、縮まない操作群、明瞭なfocus-visibleを追加 |
| 印刷dialog | Escapeで閉じず、開閉後のfocus位置も管理していなかった | 開いたdialogへfocusし、Escape/背景/取消で閉じ、印刷buttonへfocusを戻す |

## 機能ごとの現在地

| 機能 | 実装状態 | まだ「完了」としない理由 |
|---|---|---|
| ローカルPDF表示・注釈・メモ | mobile/desktopに実装。mobileはpen筆圧とページ実寸overlayを保持 | 合成pen入力はnative instrumentationで検証するが、Apple Pencil/各社penと回転は物理端末未検証 |
| 保存・書き出し | desktopは原本保存/別名保存、mobileは64 MiB以下の注釈済み別コピー | mobileはOS providerの元ファイルへ安全に上書きするnative bridgeが未実装。大容量はJS heapへ展開せずdesktopへ案内する |
| crash recovery | 両UIに実装 | process kill、disk full、DB lockはmobile物理端末で未検証 |
| Google Drive | mobileの接続、一覧、download、logout/revoke UI | production OAuth、実アカウント、upload、offline queue、継続同期、競合UIが未検証または未実装 |
| 暗号化PDF | mobileに保存しないpassword prompt | native E2E/物理端末証跡がなく、desktopは未対応 |
| 印刷 | desktop print preview、mobile native print dialog | AirPrint/Android Print Serviceと紙/PDF出力の実機証跡なし |
| 日本語・英語 | 主要画面と一次エラーを共通catalog化 | OS/native module由来の未知のエラー本文は分類し切れず、長文・dynamic type実機確認も残る |

## 残る実機ゲート

次はコードを読んだだけ、Simulatorで画像が出ただけでは合格にしません。

- VoiceOverとTalkBackで、読み上げ順、操作名、選択/無効状態、modal focusを確認する
- 200%相当の文字サイズ、画面回転、iPad Split View、Android小画面で欠落や重なりがないことを確認する
- 外付けkeyboardだけでdesktop全操作とmobile主要操作へ到達できることを確認する
- Apple Pencil/Android stylusの傾き、hover、palm rejectionと、zoom、pan、rotation後の注釈位置がPDF書き出し結果と一致することを確認する
- Files/Document Provider、共有sheet、AirPrint/Android Print Service、production Google OAuthを署名済みbuildで確認する
- 300 MB PDFのAVD gateとは別に、物理端末のlow-memory、background/foreground、OS process kill、disk full時の復旧とエラー表示を確認する

正式リリース判定はこの文書ではなく、[RELEASE_GATE.md](RELEASE_GATE.md)の署名済み成果物・物理端末証跡を使います。
