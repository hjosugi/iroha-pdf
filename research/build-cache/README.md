# build-cache research — neighbor delta vs FastCDC dedup

ビルドキャッシュ研究（delta-materialized build artifacts）の実証ワークスペース。
研究メモ本体は [BUILD_CACHE_RESEARCH.md](BUILD_CACHE_RESEARCH.md)（唯一の真実源）。

## 構成

```
BUILD_CACHE_RESEARCH.md   研究メモ統合版（論文骨格 / related work / 検証キュー / 検証ログ）
harness/run_experiment.py 予備実験ハーネス（lua 40コミット × 2構成）
results/                  実測結果（summary.json / <config>.json / SUMMARY.md）
corpus/                   lua clone + ビルド成果物（git管理外・再生成可能）
```

## 再実行

```bash
cd research/build-cache
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python bsdiff4 fastcdc zstandard
git clone https://github.com/lua/lua corpus/lua   # 記録済みSHAは results 参照
.venv/bin/python harness/run_experiment.py
```

計測内容: cache miss（前コミットに同一パスの近傍がある変更成果物）ごとに

- `zstd` — per-blob zstd level 3（Bazel `--remote_cache_compression` 相当）
- `cdc512k` / `cdc16k` — FastCDC 2020 dedup（Bazel既定 min128k/avg512k/max2M と CDC有利設定）+ 新規チャンクのzstd
- `bsdiff` — 近傍delta（suffix-sort、bsdiff4）。**復元してdigest検証**
- `zstd_patch` — 近傍delta（`zstd -19 --long=27 --patch-from`）。**復元してdigest検証**

を転送バイト数と **CPU時間（user+sys）** の両方で記録する。CASモデルは
「過去全コミットのチャンク無制限保持」（CDC有利側の仮定）、近傍選択は
trivial selector（同一パス直前バージョン）。
