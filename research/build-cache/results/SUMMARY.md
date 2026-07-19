# 予備実験 結果サマリ（ローカル再実行・確定値）

実行日: 2026-07-19 / ホスト: E14 (Linux x86_64, gcc 15系) / ハーネス: `harness/run_experiment.py`
corpus: lua/lua first-parent 連続40コミット（84938a7d2b68 まで）× 2構成、成果物36個/コミット。
**この文書の数値が正**（メモ§11の初回計測値を置き換える）。raw dataは `lua-O2.json` / `lua-g.json`。

## 転送バイト数（全miss合計）

| corpus | misses | 1-chunk率(cdc512k) | raw | zstd | cdc512k+zstd | cdc16k+zstd | **bsdiff** | **zstd --patch-from** |
|---|---|---|---|---|---|---|---|---|
| lua-O2 | 111 | 78.4% | 20.88 MB | 8.23 MB | 7.41 MB | 3.43 MB | **0.34 MB** | 0.36 MB |
| lua-g  | 215 | 70.7% | 68.66 MB | 27.94 MB | 22.38 MB | 11.74 MB | **2.07 MB** | 2.22 MB |

neighbor delta / CDC 比:

| corpus | bsdiff / cdc512k+zstd | bsdiff / cdc16k+zstd |
|---|---|---|
| lua-O2 | **4.6%** (21.8x) | 9.9% (10.1x) |
| lua-g  | **9.2%** (10.8x) | 17.6% (5.7x) |

## CPU時間（全miss合計、user+sys）— メモ§11の未測定項目を解消

| corpus | zstd | cdc512k | cdc16k | bsdiff diff | bsdiff apply | patch-from diff | patch-from apply |
|---|---|---|---|---|---|---|---|
| lua-O2 | 0.10 s | 0.10 s | 0.06 s | 2.54 s | 0.09 s | 3.24 s | 0.19 s |
| lua-g  | 0.29 s | 0.29 s | 0.19 s | 9.70 s | 0.28 s | 11.01 s | 0.42 s |

- bsdiff diff ≒ **23〜45 ms/miss 平均**（suffix sort込み）。C compile 1action相当以下であり、CI環境では転送削減が支配的。適用側(クライアント)は ~1 ms/miss で無視できる
- 「bsdiffはsuffix arrayが重い」という懸念は本規模（artifact ≤3MB）では実害なし。CDC想定規模（数十MB）での再評価は引き続き必要

## 健全性

全326 miss × 2方式（bsdiff / zstd --patch-from）の再構成を復元後digest検証し、**不一致ゼロ**（`all_deltas_verified: true`）。H3（verified reconstructionで誤hit構成上ゼロ）の実証的裏付け。

## 発見（メモ§11の初回計測との差分を含む）

1. **方向は確定（GO判定を維持）**: neighbor deltaはBazel既定CDCの4.6〜9.2%、CDC有利設定に対しても9.9〜17.6%の転送量。1桁以上の優位は再現した。
2. **倍率は初回計測より控えめ**: 初回の1.5〜7.8%に対し、本再実行では4.6〜17.6%。コミット窓の違い（本走では readline 統計リンク変更・LOOPVAR 削除などビルド全域に波及するコミットを含む）が要因とみられる。論文にはこの保守的な値を使う。
3. **⚠ メモ発見#4の修正（重要）**: 「バイナリ特化delta形式（bsdiff）が本質的で、zstd系は大きなaddress shiftを追えない」は**現代のzstd --patch-from には当てはまらない**。`zstd -19 --long=27 --patch-from` はbsdiff比 +5〜7% の転送量に収まった（0.36 vs 0.34 MB / 2.22 vs 2.07 MB）。初回計測のzdelta 80x劣後は旧世代delta形式の問題。
   - 論文への影響（好転）: 提案transportは**REAPIが既にsupported_compressorsに持つzstdの--patch-fromモード**でほぼ実現でき、仕様拡張が最小になる。「shift耐性delta形式の選択」ではなく「**近傍を参照として渡すこと自体**」が本質、と主張を単純化できる。
4. 1-chunk率: O2で78.4%、-gで70.7%。Bazel既定パラメータ（min 128KiB）ではリリース成果物の大半が1チャンク＝CDC dedup無効、という初回の中核観測は再現（100%ではなかったが議論は不変）。
5. デバッグビルドはmiss数・転送量とも最大（215 miss / raw 68.7MB）で、削減の絶対量が最も大きい（22.4→2.1MB）。「開発者が日常的に回すのはデバッグビルド」という実用面の主張は維持。

## 既知の限界（次の実験へ）

- corpus 1プロジェクト（lua）、artifact ≤3MB。CDC本来の想定規模（数十MB〜）での検証が必要
- 近傍選択はtrivial selector（同一パス直前バージョン）のみ。oracle上限とsketch ANNのablation未実施
- CASチャンク無制限保持（CDC有利側の仮定）
- zstd --patch-from の適用側は old bytes 全体を要する（bsdiffも同様）。近傍がlocal CASに無いCase Bには適用不可（メモ§1のとおり）
