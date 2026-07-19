# ビルドキャッシュ研究メモ（統合版）

最終更新: 2026-07-19

## このメモの使い方

3つの会話スレッド（Snowflake原理の応用 / 多次元hash / 関数型・量子）で出た材料を、論文執筆の単位に再編成したもの。

- 第2節が論文の骨格。ここが変わったら他が全部変わる
- 第3節がrelated work対照表。新しいLLM出力やdeep researchレポートが来たらここに流し込む
- 第4節が未検証主張リスト。すべての引用はここを通してから本文に書く

状態タグの定義:

| タグ | 意味 |
|---|---|
| [確認済] | 一次文献または実装を直接確認した |
| [要検証] | LLM出力または記憶ベース。一次文献未確認 |
| [新規仮説] | 自分の主張。先行研究の網羅調査が未完 |
| [却下] | 検討したが本論から外す。理由を記録 |

## 1. 中心命題

現在のビルドキャッシュは等価関係をキーとする部分関数である。これを、キャッシュ集合上のコスト最小化探索に一般化する。健全性はexact digest検証を最終段に残すことで保つ。

```
従来:  lookup(x) = if ∃y ∈ C. k(y) = k(x) then out(y) else ⊥

提案:  plan(x)   = argmin_{y ∈ C ∪ {∅}} cost(y ⇝ x)
       制約:      digest(result) = digest_expected(x)
```

- cost(y ⇝ x) = 0 → exact hit（従来のキャッシュヒット）
- cost(∅ ⇝ x) → full rebuild（従来のキャッシュミス）
- その中間 → 未開拓の設計空間

full rebuildとexact hitが同じ式の特殊ケースになる、という統一が理論的な売り。

### 中間に置ける3つの機構

| 機構 | 内容 | 健全性の根拠 | 強度 |
|---|---|---|---|
| M1 delta materialization | 近傍artifactからbinary deltaで再構成 | 復元後にdigest検証 | 強い（本命） |
| M2 warm start | 近傍のコンパイラ状態から増分コンパイル開始 | コンパイラ自身の無効化に委譲 | 中 |
| M3 dimensional invalidation | 多次元キーで部分変更→部分無効化 | 次元ごとのexact hash | 中（既存の一般化） |

### M1の適用条件（レビュアが必ず突くポイント）

「exact missなら出力digestが分からないのでは？」という反論に先回りする。

```
Case A: remote action cache は hit / local CAS に bytes がない
        → 出力digestは既知。近傍からdelta再構成してdigest検証。
        → 完全に健全。REAPIの構造にそのまま乗る。本命ケース。

Case B: 誰もそのactionをビルドしていない真のmiss
        → 出力digestは未知。M1は使えない。M2のみ。
        → 投機的で弱い。将来課題に回す。
```

論文の主戦場はCase A。すなわち「remote build cacheにおける delta圧縮されたartifact転送」。測定可能で、健全性が自明で、実装可能。

フック: gitはこれをsource objectに対して既に解決している（packfile delta / thin pack）。build cacheはbuild outputに対して未解決。

## 2. 論文アウトライン

### タイトル候補（英語）

1. Beyond Hit and Miss: Distance-Aware Build Caching with Verified Reconstruction
2. Delta-Materialized Build Artifacts: Reducing Remote Cache Transfer Without Sacrificing Soundness
3. From Equivalence to Distance: Generalizing Build Cache Lookup as Cost Minimization

候補2が最も査読に通りやすい（測定対象が明確）。候補1・3は理論色が強いのでOOPSLA/ICFP寄り。

### Abstract skeleton（英語 / 埋める順に番号）

```
(1) Modern build systems key their caches on an exact digest of the action.
    A lookup is a binary decision: hit or miss.
(2) This wastes work. A cache miss on artifact x often occurs while the cache
    holds y that differs from x in a small number of bytes.
(3) We generalize cache lookup from an equivalence test to a cost-minimizing
    search over cached artifacts. Full rebuild and exact hit become the two
    endpoints of one formulation.
(4) Soundness is preserved because every reconstruction path terminates in an
    exact digest check. A wrong prediction costs time, never correctness.
(5) We implement this as delta-materialized transport for remote build caches
    and evaluate on N months of commit history from M repositories.
(6) We reduce transferred bytes by X% and end-to-end incremental build time by
    Y%, with zero incorrect reuses by construction.
```

### 節構成

| 節 | 内容 | 材料の出所 |
|---|---|---|
| 1 Introduction | 「最速のタスクは実行されなかったタスク」→ しかし現状は2値判定 | Thread 1 |
| 2 Background | content-addressed cache, REAPI, early cutoff | 要文献 |
| 3 Motivation | 実測: cache missのうち近傍が存在する割合。予備実験が必須 | 第11節 |
| 4 Design space | 等価 vs 距離。なぜmetricでhit判定してはいけないか（定理化） | Thread 2 §1 |
| 5 Formulation | plan(x) = argmin cost。3層アーキテクチャ | Thread 2 §6 |
| 6 Implementation | REAPI互換のdelta transport。sketch索引、delta適用 | 未実装 |
| 7 Evaluation | commit履歴replay。転送バイト数が主指標 | 第6節 |
| 8 Related work | Build Systems à la Carte, SAC/Adapton, similarity-based dedup, 量子は1段落 | 第3節 |
| 9 Limitations | Case B、hermeticity前提、sketch索引のメモリコスト | |

### 3層アーキテクチャ（第5節の図）

```
Layer 3  sketch / embedding      距離        近傍選択・prefetch・scheduling
                                             誤ってもコストは時間のみ
─────────────────────────────────────────────────────────────────────
Layer 2  dimension hashes        部分等価    健全な無効化のpruning
                                             ABI/impl分離の一般化
─────────────────────────────────────────────────────────────────────
Layer 1  exact digest            等価        再利用の最終判定（正しさの門番）
```

設計原則: 正しさは等価が守り、性能は距離が稼ぐ。距離が正しさに触れることは一度もない。

### 投稿先候補

| venue | 適合条件 |
|---|---|
| MSR | commit履歴replayの予備実験のみ。最初の一本として最適 |
| ICSE / FSE / ASE | 実装+実測が揃った本体 |
| USENIX ATC / EuroSys | システム実装が主張の中心になった場合 |
| OOPSLA / ICFP | 「metricから健全なcache keyは作れない」の形式化が主張の中心になった場合 |

## 3. Related work 対照表

新しい調査結果はこの表に追記する。「差分」列が空の行は論文に書けない。

### 3.1 増分計算・ビルドシステムの理論

| 主張 | 先行研究 | 我々の差分 | 状態 |
|---|---|---|---|
| Applicative=並列可能 / Monad=順序依存でbuild言語を設計 | Build Systems à la Carte (Mokhov, Mitchell, Peyton Jones, ICFP 2018 / JFP 2020) | 差分なし。完全に既出。この視点を新規性として書いたら即reject | [要検証] |
| 純関数型なら依存推導を自動化 | Shake (Mitchell, ICFP 2012) の動的依存、Nix (Dolstra thesis 2006)、Riker (ATC 2022) の実行トレース | 差分なし | [要検証] |
| ADT構造レベルの細粒度増分 | Self-Adjusting Computation (Acar, PhD 2005)、Adapton (PLDI 2014)、ILC (Cai et al., PLDI 2014)、DBSP (VLDB 2023) | 差分なし。ただしsoundness証明のテンプレートとして借用する | [要検証] |
| early cutoff（出力hashが同じなら伝播停止） | Build Systems à la Carte が命名。Bazel Skyframeでは "change pruning" として実装を確認（InvalidatingNodeVisitor.java 等）。無効化粒度はSkyValueノード単位 | 差分なし。Layer 2の既存例として引用 | [確認済(実装)] |
| 純関数 ⇔ CAS の同型 | Nix, Unison | 差分なし。前提として引用 | [要検証] |

結論: 「FPが使えるか」は10年以上前に決着済み。新規性はここには残っていない。

### 3.2 多次元キー・部分無効化（Layer 2）

| 主張 | 先行研究 | 我々の差分 | 状態 |
|---|---|---|---|
| ABI hashとimpl hashの分離 | Bazel ijar、Buck source ABI | 差分なし。2次元版として既存 | [要検証] |
| query粒度のfingerprint | Rust incremental compilation (red-green)、Buck2 DICE | 差分なし | [要検証] |
| 次元分割の自動発見 | 未調査 | 差分あり（候補）。commit履歴から無効化期待値を最小化する分割を学習 | [新規仮説] |

### 3.3 類似性・delta（Layer 3、本命）

| 主張 | 先行研究 | 我々の差分 | 状態 |
|---|---|---|---|
| 局所性保存hash | LSH (Indyk-Motwani, STOC 1998)、SimHash (Charikar, STOC 2002)、MinHash (Broder 1997) | 道具として利用 | [要検証] |
| similarity-based delta compression（ストレージ） | US9582222B2 ほか。signature/sub-signatureで類似ブロック検出→参照ブロックからのdelta | 対象がストレージブロック。build artifactではない | [確認済(検索)] |
| 意味的類似度でキャッシュhit率を連続量にする | DAOEF (arXiv 2604.20129)。LSHを増分計算に拡張、hit率0-100%連続と明言 | 対象がedge AI推論。健全性要件がない領域 | [要検証(本文未読)] |
| source objectのdelta転送 | git packfile / thin pack | build outputには未適用 | [要検証] |
| CDCチャンク分割によるCAS転送dedup | REAPI SplitBlob / SpliceBlob（PR #282、2025-07-09 merge、Sascha Roloff）+ 後続 #337 #353 #357。ChunkingFunction: FastCDC 2020 / RepMaxCDC。Bazelが --experimental_remote_cache_chunking として実験実装済（2026） | 最重要の先行技術（今回発見）。chunk完全一致のdedupであり、近傍を選んでdeltaを取る方式ではない。verified reconstruction（digest検証で終端）のパターンは仕様レベルで既に受容されている | [確認済] |
| build cacheにおける近傍選択delta transport | 未発見（CDC chunkingが最接近） | 本論の主張（絞り込み後）: コンパイル済みartifactはoffset shiftが全体に波及してchunk同一性が崩れやすい。bsdiff系delta（実行バイナリのdiff用に設計）はまさにそこを狙う。CDCに対する優位を示せるかが勝負 | [新規仮説] |

新規性のギャップの修正（2026-07-19）: 「距離を使った転送削減」自体はCDC chunkingとして REAPI/Bazelに入り始めている。残るギャップは「chunk完全一致」と「近傍delta」の間。コンパイル済みバイナリでCDCが苦手とする微小・全域的な変化を、近傍選択 + delta encodingで回収できることを示すのが本論の主張になる。

### 3.4 予測・スケジューリング（Layer 3、副次）

| 主張 | 先行研究 | 我々の差分 | 状態 |
|---|---|---|---|
| 変更をvector化してテスト選択 | Meta Predictive Test Selection (ICSE-SEIP 2019) | 対比として引用。「テストは見逃し許容、artifact再利用は許容ゼロ」 | [要検証] |
| 学習コストモデルでcritical path scheduling | ML for Systems 一般 | 副次的貢献 | [要検証] |

### 3.5 量子（related workで1段落のみ）

| 主張 | 先行研究 | 我々の扱い | 状態 |
|---|---|---|---|
| DBクエリ最適化への量子アニーリング | Trummer & Koch, PVLDB 2016。ただしこれはmultiple query optimizationであってjoin orderingではない。join orderingは後発（Schönberger et al. 系） | 引用必須。ただし1段落 | [要検証] |
| 指数時間DPへの量子高速化 | Ambainis et al., SODA 2019 | 対比に使う。ビルドの依存解析はO(V+E)の線形時間問題であり、入力読み出しが下界。量子加速の構造的余地がない | [要検証] |
| ビルドスケジューリングのQUBO定式化 | 未調査 | 論文にはなるが工学的に無意味（数千タスクなら古典ソルバがミリ秒） | [却下] |

### 3.6 実証比較

| 主張 | 先行研究 | 用途 | 状態 |
|---|---|---|---|
| artifact-based tool (Bazel/Buck/Pants) がDAG細粒度で並列とキャッシュに優れる | "The Cost of Downgrading Build Systems: A Case Study of Kubernetes" (arXiv 2510.20041) | Introductionの動機づけ、評価対象の選定根拠 | [要検証(本文未読)] |
| server-side digest管理で大容量ファイルのhash再計算を回避 | Bagzel-xattr (arXiv 2606.00162) | 関連手法。hash計算コスト自体がボトルネックになる事例として引用可 | [要検証(本文未読)] |

## 4. 未検証主張リスト（検証キュー）

本文に書く前に必ずここを通す。優先度順。

### 最優先（崩れると論文が成立しない）

| ID | 主張 | 検証方法 | 状態 |
|---|---|---|---|
| V1 | REAPI / Bazel のCAS転送に近傍選択のdelta encoding（bsdiff系）は存在しない。zstd単体圧縮あり。ただしCDCチャンクdedup（SplitBlob/SpliceBlob）は存在 → 検証ログ参照 | 2026-07-19 実施。remote-apis @becdd8f / bazel @3cdd083 のソース直読 | [確認済] |
| V2 | cache missの際、local CASに「近い」artifactが実際に存在する割合が有意 | 予備実験。commit履歴replayで測定 | [新規仮説] |
| V3 | artifact間の類似度とdeltaサイズに相関がある | bsdiff / zstd dictionary で実測 | [新規仮説] |
| V4 | build cacheへの近傍選択delta encodingの先行研究が存在しない（CDC chunkingは存在確認済 → 3.3）。SplitBlob提案元（justbuild周辺）の文書・評価データも要調査 | DBLP / Scholar / arXiv + BazelCon資料。キーワード: build cache, delta encoding, blob splitting, CDC | [新規仮説] |

### 高（related workの精度に直結）

| ID | 主張 | 検証方法 | 状態 |
|---|---|---|---|
| V5 | Build Systems à la Carte の書誌情報とApplicative/Monadic分類の内容 | 原論文（ICFP 2018版とJFP 2020版の差も確認） | [要検証] |
| V6 | Adaptonのsoundness定理（from-scratch consistency）の正確な言明 | PLDI 2014原論文 | [要検証] |
| V7 | Buck2 DICEの無効化粒度がfileではなくcomputation | Buck2ドキュメント/ソース | [要検証] |
| V8 | Bazel ijarの現行仕様（impl変更がdownstreamを無効化しない） | third_party/ijar/README.txt 確認: method code・privateメンバを除去したinterface jarをコンパイル依存に使用 | [確認済] |
| V9 | Trummer & Koch PVLDB 2016 が MQO であること、join ordering量子論文の著者と年 | 原論文 | [要検証] |
| V10 | DAOEF (arXiv 2604.20129) の主張の正確な内容 | arXiv本文を読む | [要検証] |

### 中（引用の正確さ）

| ID | 主張 | 状態 |
|---|---|---|
| V11 | Meta Predictive Test Selection の書誌（ICSE-SEIP 2019, Machalica et al.） | [要検証] |
| V12 | git packfile / thin pack のdelta選択ヒューリスティック | [要検証] |
| V13 | Unisonの名前非依存AST hash | [要検証] |
| V14 | LtHash（Bellare-Micciancio系のlattice hash）の実運用 | [要検証] |
| V15 | NCD (Cilibrasi & Vitányi, IEEE TIT 2005) が距離と圧縮サイズを結ぶ理論的根拠になるか | [要検証] |
| V16 | Ambainis et al. SODA 2019 の対象が指数時間DPであること | [要検証] |

### 形式化が必要な主張

| ID | 主張 | 状態 |
|---|---|---|
| H1 | metricからは健全なcache keyを構成できない（等価関係が必要）ことの証明 | [新規仮説] |
| H2 | plan(x) = argmin cost がfull rebuildとexact hitを統一することの定式化 | [新規仮説] |
| H3 | 全再構成経路がdigest検証で終端するなら誤hit確率が構成上ゼロ、の証明 | [新規仮説] |

## 5. 却下・保留した方向

記録しておかないと同じ議論を繰り返すため残す。

| 方向 | 却下理由 |
|---|---|
| vector類似度でcache hitを判定 | silent incorrect buildを生む。ビルド関数は不連続（; 一文字でビルド成功→コンパイルエラー）。テスト失敗より悪い障害モード |
| 量子によるビルド依存解析の高速化 | O(V+E)の線形時間問題。入力読み出しが下界。構造的に余地なし |
| 量子アニーリングによるスケジューリング | 論文にはなるが工学的に無意味。数千タスク規模で古典ソルバがミリ秒で十分解 |
| Comonadによるpruningの形式化 | 新しい定理やアルゴリズムが出ない限り "formalization without payoff"。Build Systems à la Carteが既に実用的抽象化を提供済み |
| Langevin dynamics / SDEでビルド時間をモデル化 | stochastic schedulingの言い換え。物理の名前を付けただけでは装飾扱い |
| 微分可能DAG / gradient-based scheduling | スケジューリングは離散組合せ問題。連続緩和の精度が課題。実質は「学習コストモデル+古典ソルバ」に収束 |
| 「最新のツリーアルゴリズム」でDAG走査を高速化 | 全走査するなら O(V+E) が下界。狙うべきは「走査しない」側 |

## 6. 実験設計

### 予備実験（MSR向け、最優先）

問い: cache missのとき、local CASに「近い」artifactは実在するか。

```
1. 対象リポジトリのcommit履歴を N ヶ月分取得
2. 各commitでビルドし、action digest と output bytes を記録
3. commit i の各cache missについて、commit 1..i-1 のCASから
   最良の近傍を探索（oracle: 全探索）
4. 測定: delta(近傍, target) サイズ / target サイズ、および
   FastCDC dedup後の要転送サイズ / target サイズ（CDCとの比較がGo/No-Go判定）
```

この比率が十分小さければ論文が成立する。大きければ設計から見直し。

### 本実験

| 項目 | 内容 |
|---|---|
| データセット | 大規模OSSのcommit履歴。候補: Bazel自身、Chromium、Rust、TensorFlow。ビルド再現性が選定基準 |
| 主指標 | 転送バイト数 |
| 副指標 | 再実行action数、E2E incremental build時間、delta適用時間、sketch索引のメモリ使用量 |
| 健全性指標 | 誤hit数（構成上ゼロであることの確認） |
| baseline | (a) 無圧縮 (b) zstd単体 (c) FastCDC chunk dedup（Bazel experimental相当） (d) 提案（neighbor delta） |

### Ablation（近傍選択の質がどれだけ効くか）

| 近傍選択方式 | 意味 |
|---|---|
| (i) 同一targetの直前バージョン | 最も素朴。sketch不要 |
| (ii) sketch ANN | 提案手法 |
| (iii) oracle（全探索最良） | 上限。(ii)がここにどれだけ近いかが提案の価値 |

(i) が (iii) に十分近いなら、sketchは要らないという結論もありうる。その場合は「単純な手法で十分」という negative result 論文になる。これも価値がある。

## 7. 一次文献リスト（読む順と抽出目的）

| # | 文献 | 抽出するもの |
|---|---|---|
| 1 | Build Systems à la Carte (ICFP 2018 / JFP 2020) | この分野の座標系。自分のアイデアの位置。scheduler×rebuilderの語彙 |
| 2 | REAPI仕様 + Bazel remote execution実装 | V1の検証 → 済（検証ログ）。次はSplitBlob提案元の設計文書・評価データ |
| 3 | Adapton (PLDI 2014) | soundness証明の書き方の手本 |
| 4 | Acar, Self-Adjusting Computation (PhD 2005) | 細粒度増分の原点 |
| 5 | Incremental Lambda Calculus (PLDI 2014) | 「変更の微分」の形式理論 |
| 6 | Shake (ICFP 2012) | monadic buildの実装 |
| 7 | Dolstra, Nix thesis (2006) | 純関数的デプロイ、hermeticityの定義 |
| 8 | DBSP (VLDB 2023) | 増分計算の代数的統一。DB視点とビルド視点の橋渡し |
| 9 | Riker (USENIX ATC 2022) | トレースによる依存自動発見 |
| 10 | git packfile / delta encoding のドキュメント | M1の既存proof of concept |
| 11 | Trummer & Koch (PVLDB 2016) | 量子の1段落用 |
| 12 | arXiv 2510.20041 / 2604.20129 / 2606.00162 | 直近の関連。本文を読んで対照表を更新 |

## 8. 新しいLLM出力・調査レポートの流し込み手順

1. レポート内の主張を1件ずつ抜き出す
2. 第3節の対照表のどの行に対応するか判定。新しい行なら追加
3. 「差分」列を埋める。埋まらなければ論文には書けない
4. 引用があれば第4節に [要検証] で登録
5. 引用が主張を実際に支持しているか確認する（それらしいURLが付いているが本文と主張がずれている誤対応はdeep researchでも起こる）
6. 一次資料と二次資料（ブログ、Medium）を区別する。二次資料は論文に引用しない

複数LLMの出力を集め続けると再掲が増えて差分管理が難しくなる。このメモが唯一の真実源。生の出力は保管するが、参照するのはここだけにする。

## 9. 次のアクション

| 優先 | アクション | 完了条件 |
|---|---|---|
| 1 | V1の検証（REAPIにdelta転送がないことの確認） | 済（検証ログ） |
| 2 | V4の検証（先行研究の網羅検索） | DBLP/Scholar/arXivで該当なしを確認、検索クエリを記録 |
| 3 | 予備実験の対象リポジトリ選定 | ビルド再現可能な候補を2つ確保 |
| 4 | 予備実験の実装 | delta比率の分布が出る |
| 5 | 第3節の [要検証] を順に潰す | [確認済] 比率を上げる |

判断ポイント（2026-07-19 に判定済 → GO）: 予備実験でneighbor deltaは FastCDC dedupの1.5〜7.8%の転送量で済んだ。この方向を続ける。

## 10. 検証ログ

### 2026-07-19: V1検証（remote-apis / bazel ソース直読）

対象commit:

- bazelbuild/remote-apis @ becdd8f (2026-03-31)
- bazelbuild/bazel @ 3cdd083 (2026-07-19)

確認事実:

- 近傍参照のdelta encoding（bsdiff / vcdiff / xdelta系）はREAPIにもBazelにも存在しない。proto全文・remoteモジュール全文のgrepで該当なし。
- per-blob圧縮は存在する:
  - ByteStream `compressed-blobs/{compressor}` リソースパス
  - CacheCapabilities.supported_compressors（zstd / deflate）
  - Bazelフラグ: `--remote_cache_compression` + `--experimental_remote_cache_compression_threshold`
- CDCチャンク分割dedupがREAPIに正式に入っている:
  - SplitBlob / SpliceBlob RPC。PR #282でmerge（2025-07-09、author: Sascha Roloff）
  - 後続PR: #337（doc整理）、#353（doc改善）、#357（ChunkingFunction enum追加）
  - ChunkingFunction.Value: FAST_CDC_2020（Xia et al. 2020を明示引用）、REP_MAX_CDC（buildbarn/go-cdc）
  - 仕様コメントが目的を明記: 「似たblobのchunkがローカルにあれば取得データを削減できる。fixed-sizeではなくcontent-definedで分割すべき」
  - SpliceBlobRequest.blob_digest は必須で、サーバはsplice結果のdigest一致を検証 → verified reconstruction（digest検証で終端する再構成）は仕様レベルで既に受容済み
- Bazelが実験実装済み:
  - フラグ `--experimental_remote_cache_chunking`（default false、FastCDC 2020）
  - 実装: remote/chunking/FastCdcChunker.java、ChunkedBlobDownloader.java、ChunkedBlobUploader.java
  - ChunkedBlobDownloaderは再構成後に Utils.verifyBlobContents(blobDigest, digestOut.digest()) でクライアント側digest検証（shouldVerifyDownloads 時）
- Skyframeに "change pruning"（early cutoffの実装）を確認: InvalidatingNodeVisitor.java、SkyFunction.java 等のコメントに明記。無効化粒度はfileではなくSkyValueノード単位。
- third_party/ijar/README.txt を確認（V8）: method code・privateメンバ・非.classファイルを除去したinterface jarをコンパイル依存に使い、impl-only変更によるdownstream再コンパイルを回避する設計。

### V1の結論の修正が論文に与える影響

- 旧仮説「REAPIにdelta的な転送削減はない」→ 修正: 「近傍選択deltaはない。ただしchunk完全一致dedup（CDC）が2025年に仕様入りし、Bazelも実験実装済み」
- 位置づけの変化: 提案は空白地帯の発明ではなく、コミュニティが今まさに進んでいる方向（CDC）の限界を突く次の一手になる。題材としてはむしろtimelyになった。
- 健全性の議論は楽になった: verified reconstructionはREAPIが既に採用したパターンなので、査読で健全性を疑われるリスクが下がった。争点は健全性ではなくCDCに対する転送削減の上乗せ幅に移る。
- baselineにFastCDC chunk dedupを必ず含める。CDCに勝てなければ成立しない。

## 11. 予備実験の結果（2026-07-19）

詳細は results/SUMMARY.md、raw dataは results/*.json。ハーネス: harness/run_experiment.py（このリポジトリでローカル再実行可能）。

対象: lua/lua 連続40コミット × 2構成（-O2 / -g -O0）、成果物36個/コミット。測定対象は「前バージョンが手元にあるcache miss」のみ（exact hitは全方式0バイト）。

（初回計測値 — ローカル再実行の結果は results/SUMMARY.md を正とする）

| corpus | FastCDC avg | misses | 1-chunk率 | zstd(MB) | cdc+zstd(MB) | bsdiff(MB) | bsdiff/cdc+zstd |
|---|---|---|---|---|---|---|---|
| lua-O2 | 512 KiB (Bazel既定) | 113 | 100.0% | 8.08 | 8.08 | 0.29 | 3.6% |
| lua-O2 | 16 KiB | 113 | 27.4% | 8.08 | 3.74 | 0.29 | 7.8% |
| lua-g | 512 KiB (Bazel既定) | 192 | 67.2% | 26.34 | 21.47 | 0.33 | 1.5% |
| lua-g | 16 KiB | 192 | 7.3% | 26.34 | 10.75 | 0.33 | 3.0% |

### 主要な発見

1. Bazel既定パラメータではFastCDCがリリースビルド成果物に無効。min chunk 128 KiB に対し成果物が小さく、-O2 corpusでは全missが1チャンク。CDCの転送量 = raw転送量。これ自体がMSR級の観測結果。
2. CDCに有利なパラメータを与えてもneighbor deltaが1桁以上優位。avg=16 KiBまで下げても bsdiff は cdc+zstd の3.0〜7.8%。
3. デバッグビルドで差が最大化（1.5%）。デバッグ情報はoffsetと行番号が全域に散るため、chunk完全一致前提のCDCが最も苦手とする変化パターン。開発者が日常的に回すのはデバッグビルドなので実用上の意味が大きい。
4. バイナリ特化delta形式であることが本質的。lua-g の .a で zdelta 4.14 MB vs bsdiff 0.051 MB（約80倍差）。zstdのdictionary matchは大きなaddress shiftを追えない。suffix sortベースのbsdiffがそれを吸収する。→ 提案の核はdeltaを取ること自体ではなく、shift耐性のあるdelta形式を選ぶこと。

### 未測定・要注意

- ~~CPU時間。bsdiffはsuffix arrayを作るため重い。転送量とCPUのトレードオフが未評価。次の必須項目~~ → ローカル再実行で計測済み（results/SUMMARY.md）
- corpusが1プロジェクト、artifact最大3 MB。CDC本来の想定規模（数十MB）で結論が変わりうる
- 近傍選択はtrivial selectorのみ。oracle上限未測定
- local CASのchunk保持は無制限と仮定（CDCに有利側の仮定）
