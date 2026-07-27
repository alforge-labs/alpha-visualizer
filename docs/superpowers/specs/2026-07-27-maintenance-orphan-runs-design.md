# 孤児バックテスト結果の掃除（SP3）設計

**日付:** 2026-07-27
**位置づけ:** ブラウズ画面刷新 3 部作の第 3 部。SP1（レシピ・ロールアップ、PR #333）・SP2（銘柄カバレッジ表、PR #338）の続き
**範囲:** 2 リポジトリにまたがる。`alpha-forge`（CLI 新コマンド）と `alpha-visualizer`（`/maintenance` 画面）

> **`alpha-forge` への変更について:** 親 `alpha-trade/CLAUDE.md` の指針 2 は `alpha-forge` を
> 「参照のみ」と定めている。本 SP3 はその例外として、ユーザーから明示的な承認を得ている。

---

## 1. 解く問題

`backtest_results.db` に、**戦略定義がもう存在しない実行結果**が溜まっている。

実測（2026-07-27・実データ）:

| テーブル | 全体 | 孤児 | 孤児の容量 |
|---|---|---|---|
| `backtest_results` | 725 行 | 116 ID / 240 行 | **83.5 MB** |
| `optimization_runs` | 92 行 | 29 ID / 35 行 | 0.0 MB |
| **和集合（掃除の対象）** | — | **129 ID / 275 行** | **83.5 MB** |

**ID 数は単純な足し算にならない。** 116 + 29 = 145 ではなく **129** である。両方の
テーブルに行を持つ孤児が 16 件あり、**`optimization_runs` にしか行が無い孤児が 13 件**
ある。`backtest_results` だけを見て掃除すると、この 13 件が永久に残る。

画面と CLI が「孤児 N 件」として数えるのは**和集合の 129** である。

`backtest_results.db` は 216.7 MB。JSON 列（`equity_curve_json` / `trades_json` /
`buy_hold_curve_json`）の合計が 203.3 MB で、**そのうち 41% が孤児**である。

孤児の `run_at` は 2026-03-24 〜 2026-07-12 に分布する。`strategy_id` を見ると
`_smoke441_*` / `_smoke448_*`（テストの残骸）と `a158_*`（探索で定義を消したもの）が
混在している。

### 1.1 既存 CLI では手が届かない

`alpha-forge strategy delete --with-results` と `alpha-forge strategy purge` は既に存在し、
`--dry-run` も `-y` も持つ。しかし**孤児 ID を渡すと拒否される**:

```
$ alpha-forge strategy purge _smoke441_nvda_bb_rsi_v1 --dry-run
エラー: 戦略 '_smoke441_nvda_bb_rsi_v1' が見つかりません
```

どちらも「登録済み戦略」を起点にするコマンドで、戦略が存在しない結果には到達できない。
83.5 MB を消す手段が存在しない。

### 1.2 孤児は必ずしもゴミではない

**この設計で最も重要な前提。** `alpha-forge strategy delete` は `--with-results` を
**付けなければ結果を残す**。つまり「戦略定義は消したいが実行履歴は残したい」という
意図的な操作で孤児が生まれる。

したがって「孤児を一括で消すボタン」は誤りで、**何を消すのか見えたうえで選べる**形に
しなければならない。

---

## 2. 範囲を孤児だけに絞る

当初の SP3 構想では 4 カテゴリ（未実行 scaffold 235 件 / 孤児 run / 重複名 116 グループ /
Sharpe<0 38 件）を「整理モード」に並べる予定だった。実測して 3 つを外す。

| カテゴリ | 外す理由 |
|---|---|
| 重複名（116 グループ・324 戦略） | SP1 のレシピ・ロールアップで画面上の問題は解消済み。同名はレシピのパラメータ違いで、探索の正常な産物 |
| 未実行 scaffold（235 件） | SP2 のカバレッジ表が**同じ集合を「次に回す候補」として前向きに**提示している。同じものを「掃除対象」として並べると画面内で意味が衝突する |
| 最新 Sharpe<0（38 件） | 壊れていない。「この組み合わせはダメだった」という研究記録であり、消すと同じ探索を再び回すリスクがある |

残るのは孤児 run のみ。**削除できるのも孤児 run のみ**とする。

---

## 3. `alpha-forge` 側: `backtest prune-orphans`

```
alpha-forge backtest prune-orphans [--dry-run] [-y] [--vacuum] [--strategy ID]... [--json]
```

孤児の定義: `backtest_results` および `optimization_runs` の `strategy_id` のうち、
**その戦略を今も実行できないもの**。

「実行できる」の判定を `strategies` テーブルの有無だけで行ってはならない。**組み込み
テンプレート戦略（`strategy templates` に出る 7 件）は DB に登録されていなくても
`backtest run --strategy <id>` で実行できる。** 判定には次の 2 つの和集合を使う。

1. `StrategyRepository.list_all()` が返す `strategy_id`
2. `get_builtin_template_names()` が返す組み込みテンプレート名

> **なぜ両方が要るか（実データで踏んだ）:** `FileStrategyRepository.list_all()` は
> 組み込みテンプレートを結果に含めるが、`SQLiteStrategyRepository.list_all()` は
> DB 行しか返さない。実運用の構成は `strategies.use_db: true` なので後者が使われ、
> `list_all()` だけを信じると組み込み戦略の実行履歴が孤児と判定される。実際に
> `macd_crossover_v1`（実行可能な組み込み戦略）が孤児 129 件に混入していた。
>
> **フェーズ 2 も同じ判定を使うこと。** visualizer が `strategies.db` を直読みして
> 孤児を算出すると、同じ穴を再現する。

### 3.1 挙動

| オプション | 挙動 |
|---|---|
| `--dry-run` | 削除せず、対象を表で表示して終了する |
| `--strategy ID` | 複数指定可。指定した ID のみ削除する。省略時は全孤児が対象 |
| `-y` / `--yes` | 確認プロンプトを飛ばす |
| `--vacuum` | 削除後に `VACUUM` を実行する。**既定 off** |
| `--json` | 機械可読出力（既存の CLI 規約に従う） |

表示する列: `strategy_id` / バックテスト行数 / 最適化行数 / 容量 / `run_at` の範囲。
**容量降順**（大きいものから）に並べる。何を消せば効くかが最初に目に入る順序にする。

**「容量」の定義:** その `strategy_id` が持つ全行の**重い JSON 列**のバイト長の合計。

| テーブル | 数える列 | 数えない列 |
|---|---|---|
| `backtest_results` | `equity_curve_json` + `trades_json` + `buy_hold_curve_json` | `metrics_json` / `carry_adjusted_json` |
| `optimization_runs` | `all_trials_json` | `best_params_json` |

`metrics_json` と `best_params_json` を除くのは、小さくて「どれを消せば効くか」の
判断材料にならないため（実データで `best_params_json` の合計は 9 KB）。

SQLite のページ単位の実占有量ではない。実占有量は `VACUUM` するまで確定しないため、
概算であることを表示側でも示す。

> **フェーズ 2 への申し送り:** `GET /api/maintenance/orphan-runs` が返す `bytes` は
> **この定義と 1 バイトも違わないこと**。visualizer は SQLAlchemy 直読みで独自に集計するため、
> 列の選び方がずれると同じ孤児に対して GUI と CLI で違う容量が出る。

削除は 1 トランザクションで行い、`backtest_results` と `optimization_runs` の両方から
同じ `strategy_id` の行を消す。

**`--strategy` に孤児でない ID（＝ `strategies` に存在する ID）が指定された場合は
何も削除せずエラーで終了する。** 部分的に実行して「一部だけ消えた」状態を作らない。

### 3.2 `--vacuum` を既定 off にする理由

SQLite は `DELETE` だけではファイルが縮まない。しかし `VACUUM` は

- データベース全体の排他ロックを取る
- 一時的に元ファイルと同程度の空き容量（この環境では 216 MB）を要求する

既定 on にすると、`alpha-vis serve` が動いている環境や空き容量の少ない環境で失敗しやすい。
明示的なオプトインにする。

### 3.3 ヘルプに書くこと

`strategy delete` は `--with-results` を付けなければ結果を意図的に残すため、
**孤児は必ずしも不要なデータではない**旨をヘルプ本文に明記する（§1.2）。

### 3.4 exit code

既存の CLI 規約（`alpha-forge/docs/cli-conventions.md`、`strategy delete` / `purge` と同じ）に合わせる。

- `0` = 成功（明示キャンセルを含む）
- `1` = 実行失敗
- `2` = 引数エラー / 非対話実行で `--yes` 欠落

### 3.5 コードの置き場所

`src/alpha_forge/commands/backtest.py` は既に **3,967 行**ある。ここにロジックまで足すと
さらに肥大する。

- **ロジック**: `src/alpha_forge/backtest/orphan_pruner.py`（新規）— 孤児の検出・容量集計・
  トランザクション削除・VACUUM。`SQLiteBacktestResultRepository` と同じ層に置く
- **CLI**: `backtest.py` に `@backtest.command("prune-orphans")` を追加。上記を呼んで
  表示するだけの薄い層にする（`backtest` グループは同ファイルの 1164 行目で定義され、
  全サブコマンドが同ファイルに集まっているため、コマンド定義自体はここに置く）

---

## 4. `alpha-visualizer` 側: `/maintenance` 画面

### 4.1 なぜ Browse ではなく新ルートか

孤児 run は**戦略ではない**。`backtest_results.db` にしか存在しない行で、Browse 画面の表
（`strategies.db` 由来）には最初から出てこない。SP1・SP2 が扱ってきた「同じデータの見せ方」
とは別のデータセットである。

加えて、掃除はまれにしか行わない保守作業で、日常的に使う Browse 画面に常駐させると
ノイズになる。ルートを分ける。

`AppNav` に `Maintenance` を 1 項目追加する（`Browse | Compare | Ideas | Live` → 5 項目）。

### 4.2 API

| エンドポイント | 内容 |
|---|---|
| `GET /api/maintenance/orphan-runs` | 孤児の一覧。既存の SQLAlchemy 直読みで返す（読み取りのみ） |
| `DELETE /api/maintenance/orphan-runs` | body の `strategy_ids` を `--strategy` に渡して `forge backtest prune-orphans` を subprocess 実行 |

レスポンス（`GET`）の 1 要素:

```
{
  "strategy_id": "a158_aroon_trend",
  "backtest_run_count": 3,
  "optimization_run_count": 0,
  "bytes": 2202009,
  "first_run_at": "2026-05-11T...",
  "last_run_at": "2026-05-11T..."
}
```

書き込みは既存方針どおり forge CLI へ委譲する（`POST /api/strategies/{id}/parameters` が
`forge strategy save --force` へ委譲しているのと同じ形）。既存の
`services/forge_cli.py`（`resolve_forge_exe` / `build_forge_env` / `mask_home`）を使う。

### 4.3 VACUUM と接続プールの衝突

**subprocess を起動する前に `app.state.engine.dispose()` で SQLAlchemy の接続プールを
閉じる。** `VACUUM` はデータベース全体の排他ロックを取るため、visualizer が接続を握った
ままだと `database is locked` で失敗する。

`Engine` は `app.py` で 1 度だけ生成され `app.state.engine` に保持されている
（`db.py:152` の `get_engine`）。`dispose()` 後の次のクエリでプールは自動的に再確立される。

**画面からの削除は常に `--vacuum` 付きで実行する。** CLI では既定 off にしたが（§3.2）、
GUI から削除する目的は容量の回収そのものなので、`VACUUM` しなければ何も起きていないように
見える。§3.2 に挙げた `VACUUM` のリスク（排他ロック・一時領域 216 MB）は残るため、
**`VACUUM` が失敗しても削除自体は完了している**ことを前提に、失敗を区別して画面に伝える:

- 削除も `VACUUM` も成功 → 削除件数と回収容量を表示
- 削除は成功し `VACUUM` が失敗 → 削除件数を表示し、「容量の回収は失敗した。空き容量を
  確保して `alpha-forge backtest prune-orphans --vacuum` を実行してほしい」と伝える

### 4.4 画面

チェックボックス付きの表。

| 列 |
|---|
| 選択 |
| `strategy_id` |
| バックテスト行数 |
| 最適化行数 |
| 容量 |
| 最終実行 |

- **既定は全件未選択。** 全選択ボタンは置くが、開いた直後に押しただけで全部消える状態を作らない
- 「選択した N 件（M MB）を削除」ボタン。選択 0 件では無効
- 押すと確認を挟む（件数・容量・不可逆である旨）
- 実行後に削除件数と回収容量を表示する
- 孤児が 0 件のときは表を出さず「孤児の実行結果はありません」と出す

### 4.5 推測でラベルを付けない

`backtest_results` の孤児 240 行の `source` 列は**すべて `NULL`** だった（実行元の記録が
ない。`optimization_runs` にはそもそも `source` 列が無い）。
`_smoke441_*` は見るからにテストの残骸だが、`strategy_id` の見た目から
「テストの残骸」「探索の残骸」といったラベルを機械的に付けることはしない。

出すのは実データ（ID・行数・容量・`run_at`）だけにして、判断は人に委ねる。

---

## 5. 実装の順序

CLI が無いと画面が動かないため、2 リポジトリを順に進める。

1. **`alpha-forge`**: `backtest prune-orphans` の実装 → PR → マージ
2. **`alpha-visualizer`**: `/maintenance` の実装 → PR → マージ

**実装計画は 2 本に分ける。** 別々の git リポジトリで別々のワークツリー・別々の PR に
なるため、1 本の計画では実行できない。本仕様書からフェーズごとに計画を起こす:

- `alpha-forge/docs/superpowers/plans/2026-07-27-backtest-prune-orphans.md`（§3 が対象）
- `alpha-visualizer/docs/superpowers/plans/2026-07-27-maintenance-orphan-runs.md`（§4 が対象）

**計画はそれぞれ実装するリポジトリ側に置く。** SDD のワークスペース（`.superpowers/sdd/`）が
リポジトリルート基準で作られるため、別リポジトリの計画を参照すると台帳と成果物の置き場所が
ずれる。

どちらの計画も本仕様書を Single Source of Truth として参照する。仕様書自体は
`alpha-visualizer` 側に置く（SP1・SP2 と同じ場所に 3 部作を揃えるため）。フェーズ 1 の
`alpha-forge` PR には、本仕様書の §1〜§3 の要点を PR 本文に転記して単体で読めるようにする。

**フェーズ 2 の計画はフェーズ 1 のマージ後に書く。** 画面が呼ぶ CLI の契約（`--json` の
出力形・exit code・`--strategy` の挙動）が確定していない段階で計画を書くと、実在しない
インターフェースに対する計画になる。

`alpha-forge` は PR で CI が走らない。マージ前にローカルでフルテスト・`ruff`・`mypy`・
codemap を通す（`alpha-forge/CLAUDE.md`）。

`alpha-forge` の CLI・ドキュメントを変更するため、`alforge-labs/mkdocs_src/{ja,en}/` の
対応ページも更新し `uv run mkdocs build` で成果物を再生成する（親 `CLAUDE.md` 指針 10）。

---

## 6. テスト

### 6.1 `orphan_pruner`（`alpha-forge`）

- 孤児の検出: `strategies` に無い `strategy_id` だけを拾う。ある ID は 1 件も拾わない
- `backtest_results` と `optimization_runs` の両方から拾う
- 容量集計が JSON 列の長さの合計になる
- `--strategy` で選択削除したとき、指定した ID の行だけが消える
- **削除後、`strategies` に存在する戦略の行が 1 行も減っていない**
- 削除がトランザクションであること（途中で失敗したら 1 行も消えない）
- 孤児が 0 件のとき、削除は何もせず正常終了する
- 孤児でない ID を `--strategy` に渡すと、何も削除せずエラーになる

### 6.2 CLI（`alpha-forge`）

- `--dry-run` が実際には削除しない（実行前後で行数が変わらない）
- 非対話実行で `--yes` を欠くと exit code 2
- `--json` が機械可読な形で対象を返す
- `--vacuum` でファイルサイズが実際に縮む

### 6.3 API（`alpha-visualizer`）

- `GET` が孤児だけを返し、戦略が存在する `strategy_id` を含まない
- `DELETE` が forge CLI を正しい引数で呼ぶ（subprocess はモックする）
- forge 未導入時に導線付きのエラーを返す（既存 `FORGE_NOT_FOUND_MESSAGE`）
- 孤児 0 件のとき空配列を返す

### 6.4 画面（`alpha-visualizer`）

- 既定で全件未選択
- 選択 0 件では削除ボタンが無効
- 選択件数と合計容量がボタンに出る
- 孤児 0 件のとき空状態を出す

### 6.5 判別力の確認（ablation）

実装をわざと退行させてテストが落ちることを確認する。

- 孤児判定を反転させる（`strategies` に**ある** ID を拾う）→ 「ある ID は拾わない」が落ちること
- `optimization_runs` の削除を落とす → 「両方から拾う」が落ちること
- 削除をトランザクションでなく逐次コミットにする → トランザクションのテストが落ちること
- 画面の既定選択を「全選択」にする → 「既定で全件未選択」が落ちること

### 6.6 ゲート

`alpha-forge`:

- `uv run pytest tests/ -q`
- `uv run ruff check src/ tests/`
- `uv run mypy src/`
- codemap チェック（パイプに繋がず単独行で実行し終了コードを確認する）

`alpha-visualizer`:

- `uv run pytest tests/ -q` / `uv run ruff check src/ tests/`
- `cd frontend && pnpm vitest run` / `pnpm run lint` / `pnpm run build` / `pnpm run e2e`
- `pnpm run screenshots`（新画面が増えるため）

> `tsc --noEmit` は `tsconfig` の `files: []` により 0 ファイルを検査するため常に成功する。
> 型検査の実ゲートは `pnpm run build`（`tsc -b && vite build`）。

### 6.7 E2E フィクスチャ

`frontend/e2e/fixtures/forge/` の `backtest_results.db` に孤児行が無いと `/maintenance` を
E2E で検証できない。`tests/fixtures/build_e2e_fixture.py` に、`strategies` に対応する
定義を持たない `strategy_id` の行を追加する。`optimization_runs` 側にも 1 件入れて、
2 テーブルにまたがることを E2E でも押さえる。

---

## 7. 明示的に目的としないこと

**未実行 scaffold・Sharpe<0・重複名の削除。** §2 のとおり外した。

**`live_*` テーブルの掃除。** 現在 4 テーブルとも 0 行で、対象が存在しない。

**自動実行・定期実行。** 削除は不可逆なので、必ず人が選んで実行する。

**Browse 画面の変更。** SP3 では Browse に手を入れない。

---

## 8. リスク

**削除は不可逆。** `backtest_results.db` にバックアップの仕組みは無い。実行前の `--dry-run`
と画面上の確認が唯一の防御になる。テストで「戦略が存在する行が 1 行も減っていない」ことを
固定し、ablation で判別力を確認する（§6.5）。

**「生きている戦略の ID の集合」が単一障害点。** 孤児判定・CLI の入力検証・削除直前の
再突合の 3 段はいずれもこの集合に依存しており、集合が過小になると 3 段すべてが同時に
破れる。実測では `forge.yaml` の `strategies.use_db` を取り違えただけの設定で、稼働中の
戦略を含む 268 ID / 191.9 MB が孤児と判定された。`SQLiteStrategyRepository` は
`strategies.db` が無ければ空の DB を黙って作るため、パスの誤りでも警告が出ない。

したがって**設定ミスを検知して止まる仕組みを入れる**。次のいずれかに当てはまるときは、
明示フラグ無しでは削除を中断してエラー終了する。

- 戦略の定義が 1 件も見つからない
- 孤児が結果 DB の `strategy_id` の大半（目安 8 割以上）を占める

`--dry-run` は中断せず、警告を出したうえで一覧を表示する（見て気づけるようにするため）。

**`VACUUM` は 216 MB の一時領域を要求する。** 空き容量が足りない環境では失敗する。
失敗しても削除自体は完了しているので、エラーメッセージでその旨を伝える。
