# Live データ一括更新の GUI 化（live refresh）設計

- 日付: 2026-08-06
- 対象リポジトリ: alpha-forge（コマンド新設・config 拡張）/ alpha-visualizer（API + UI）
- 関連: alpha-visualizer #329（Live ページリッチ化）・alpha-forge #1332/PR #1333（--initial-capital）・epic #483（GUI 化ウェーブの基盤）

## 背景 / 課題

ペーパートレード実績を Live ページに反映するには、現状 CLI で 3 コマンドを毎回打つ必要がある:

1. `alpha-forge live sync-events` — oracle-strike のイベントログを rsync（forge.yaml `remote:` 設定）
2. `alpha-forge data update` — 市場データ更新（equity 構築が historical parquet の日付範囲に依存）
3. `alpha-forge live replay <portfolio> --combine-strategies ... --initial-capital 1000000` — `live_position_summaries` 再構築

課題:

- Live ページは読み取り専用で、GUI から更新できない（epic #483 で他機能は GUI 化済み）。
- `--initial-capital` はどこにも永続化されておらず、省略すると**リターン率が基準資本比で
  静かにズレる**（既定 100,000 vs 実口座 1,000,000 で 10 倍）。毎回の手打ちに依存している。
- replay の引数（portfolio_id / combine_strategies）も同様に手打ち依存で、
  `live_position_summaries.sub_strategies_json` 以外に記録がない。

## ゴール

- Live ページの「更新」ボタン 1 クリックで 3 ステップが順次実行され、完了後に画面へ反映される。
- replay パラメータが forge.yaml に永続化され、initial_capital の手打ち事故が構造的に消える。
- CLI 単体でも `alpha-forge live refresh` 1 コマンドで同じパイプラインを実行できる。

## 非ゴール

- 複数 portfolio の一括 refresh（config は単一 portfolio。必要になったら config をリスト化）。
- 自動定期更新（スケジューラ・ポーリング）。手動トリガーのみ。
- trade ベース（`live import-events`）経路の GUI 化。position ベース replay のみ対象。

## 設計

### 1. alpha-forge — config 拡張

`live:` セクションに replay 既定値を追加する:

```yaml
live:
  benchmark: ""            # 既存
  replay:                  # 新設
    portfolio_id: ""       # 例: beat_qqq_hedged_v1
    combine_strategies: [] # 例: [tqqq_sma200_atr_bho_phase2_v1_optimized, gld_bh_v1, tlt_bh_v1]
    initial_capital: null  # null なら backtest.initial_capital にフォールバック
    compare: false         # --compare 相当
```

- Pydantic モデル `LiveReplayConfig` を `LiveConfig` 配下に追加（`resources/config/default.yaml` も同期）。
- `benchmark` は既存のまま `live.benchmark` を replay でも使用する（重複させない）。

### 2. alpha-forge — `live refresh` コマンド新設

`alpha-forge live refresh [--json]` が以下を順次実行する:

| ステップ | 内容 | スキップ / fail-fast 条件 |
|---|---|---|
| 1. sync-events | 既存 sync-events と同処理 | `remote.enabled: false` なら**スキップして続行**（理由を出力） |
| 2. data update | 既存 `data update` と同処理 | スキップなし |
| 3. replay | `live.replay` 設定値で既存 replay と同処理 | — |

- **起動時 validation（fail-fast）**: `live.replay.portfolio_id` / `combine_strategies`（2 戦略以上）が
  未設定なら、ステップ実行前に設定手順を明示したエラーで終了する。
- **ステップ失敗時は即中断**し、どのステップで失敗したかをエラーに明示する
  （data update 失敗のまま replay して古いカーブを黙って出さない — Fail Loud）。
- 進捗はステップ境界ごとに stderr へ 1 行ずつ出力（visualizer の SSE ログにそのまま流れる。
  `--json` 時の stdout 純 JSON という Global Constraints と矛盾しないようにする）。
- `--json` 時は各ステップの status（done / skipped / failed）+ replay の metrics 要約を出力する。
- 実装は既存 3 コマンドのロジックをヘルパー関数へ切り出して再利用する
  （click コマンドの自己再帰呼び出しはしない）。

### 3. alpha-forge — `live replay` の config フォールバック

`live replay` 単体も「config が既定値・フラグが上書き」に統一する:

- `portfolio_id` 引数を optional 化し、省略時は `live.replay.portfolio_id` を使用。
- `--combine-strategies` / `--initial-capital` / `--compare` も省略時に config へフォールバック。
- config も引数も無い場合は現行どおりのエラー（後方互換: 既存の明示指定はそのまま動く）。

### 4. alpha-visualizer — API

- `POST /api/live/jobs` → 202 + `JobSummary`（`POST /api/data/jobs` と同型）。
  リクエストボディはアクション拡張に備え `{"action": "refresh"}` のみ受け付ける。
- `JobKind` に `live_refresh` を追加。argv は `[forge, "live", "refresh", "--json"]` の 1 コマンド。
- ガード（既存パターン踏襲）:
  - 非 loopback 公開中は `LocalWriteDisabledError`（403）。
  - forge CLI 不在は `ForgeCliNotFoundError` で起動前 fail-fast。
- 観察・キャンセルは既存 `/api/jobs` 系（SSE 含む）を共用する。
- 旧 forge（`live refresh` 未対応）では `translate_forge_failure` の既存
  「no such command」定型が発動し、forge の更新が必要である旨を案内する。

### 5. alpha-visualizer — UI（Live ページ）

- Live ページに「更新」ボタンを追加。実行中は既存ジョブ進捗 UI（SSE）を表示し、
  完了時に live 一覧 / 詳細を refetch する。
- `live_position_summaries.updated_at` を最終更新時刻としてページに表示する。
- Container/Presentational 分離（ADR-0001）: fetch・ジョブ投入は LivePage（Container）、
  ボタン・進捗表示は LiveScreen（Presentational）に置く。
- schemas 変更に伴い `pnpm run gen`（OpenAPI 型再生成）を実行し生成物をコミットする。

## エラー処理まとめ

- sync-events の SSH 失敗（トンネル障害等）: ステップ名付きでジョブ失敗。`remote.enabled: false` はスキップ扱いで成功。
- data update 失敗: そこで中断（replay へ進まない）。
- replay の validation 失敗（config 未設定）: コマンド起動直後に設定手順付きで fail-fast。
- EULA 未同意・認証切れ: `translate_forge_failure` の既存定型で変換。

## テスト方針（TDD）

- alpha-forge:
  - `live refresh` のステップ分岐（skip / 中断 / 全成功）・validation fail-fast・`--json` 出力形状。
  - `live replay` の config フォールバック（config のみ / 引数のみ / 両方 / どちらも無し）。
  - CLI テストの既知罠に注意: MagicMock パスの実ファイル化（Recorder を patch）。
- alpha-visualizer:
  - router: 403 / 202 / forge 不在 fail-fast / 旧 forge の no such command 変換。
  - `build_live_argv` の argv 構築。
  - frontend: hook・LiveScreen のボタン/進捗/refetch（`routers.<mod>.resolve_forge_exe` の patch 必須）。
- マージ前ゲート: 各リポジトリでフルテスト + ruff + mypy（forge は codemap も）。visualizer frontend は
  `pnpm run build`（tsc -b）+ vitest + lint。

## ドキュメント同期 / リリース順序

- alpha-forge: `resources/config/default.yaml`・CLI ヘルプ・alforge-labs mkdocs（ja/en）。
- alpha-visualizer: README 日英・alforge-labs mkdocs（ja/en）・スクリーンショット再撮影
  （RootLayout の CLI 依存 API は describe 共通で page.route モック）。
- リリースは forge 先行 → visualizer（依存方向どおり）。visualizer 側は旧 forge でも
  degraded 動作（エラー案内）するため、リリース間の順序逆転でも壊れない。

## 参考（再利用する既存基盤）

- JobManager + JobKind + SSE（data_fetch / data_update で確立、issue #485）。
- 非 loopback 403 ガード `local_write_enabled`（epic #483）。
- forge_sync の `run_forge_json` / `translate_forge_failure` 定型 3 種。
