# AI 戦略開発（Agent Develop）設計書

- 日付: 2026-08-02
- ステータス: 設計承認済み（実装前）
- 対象リポジトリ: alpha-visualizer（OSS・PyPI 配布）

## 背景と目的

alpha-visualizer は AlphaForge のバックテスト結果を可視化する Web GUI であり、
既に `JobManager`（非同期ジョブ基盤 + SSE 進捗）経由で `alpha-forge` CLI を
実行できる（backtest / optimize / WFT）。一方、戦略そのものの開発は Claude Code /
Codex を**ターミナルで**動かす必要があり、GUI と開発体験が分断されている。

本機能は、GUI からユーザー自身の Claude Code / Codex CLI をヘッドレスで起動し、
「ゴールを入力 → エージェントが戦略 JSON を作成 → バックテストで検証 → 結果を
GUI に反映」までを一気通貫にする。AlphaForge の「AI エージェントネイティブ」
という製品訴求を GUI 側から補強する OSS 製品機能である。

## 決定事項（ブレインストーミングでの合意）

| 論点 | 決定 |
|---|---|
| 対象ユーザー | OSS 製品機能として全ユーザー向け |
| 体験の形 | 段階導入。v1 はゴール指定型ジョブ、チャット型は後続バージョン |
| バックエンド | `claude -p` / `codex exec` の CLI ヘッドレス両対応。API キーは一切扱わない |
| 権限モデル | ワークスペース限定・ツール絞り。非 loopback bind 時は機能自体を無効化 |
| v1 の切り出し | 案A: 短時間で終わる「クイック戦略開発」ジョブ 1 種（数分想定）。自律探索（explore-strategies 相当）は含めない |

## v1 スコープ

ゴール文（自由記述）+ 対象銘柄（任意）+ バックエンド選択を入力すると、
エージェントが以下を自律実行して終了する:

1. forge ワークスペース内で戦略 JSON を新規作成（または既存の複製から修正）
2. `alpha-forge backtest run <symbol> --strategy-file <path> --json` で検証
3. 最終出力に `{strategy_id, run_id}` を含む JSON を報告

GUI はジョブ完了後に戦略一覧・結果一覧を再取得し、新戦略へのリンクを表示する。

## アーキテクチャ

新規基盤は作らず、既存の `JobManager` に新ジョブ種 `agent` を追加する。

```
GUI「開発」ビュー
  → GET  /api/agent/backends      … claude / codex の検出結果+バージョン
  → POST /api/agent/jobs          … バリデーション → JobManager.create(kind="agent") → 202
  → GET  /api/jobs/{id}/events    … 既存 SSE でログ・状態をライブ購読（変更なし）
  → POST /api/jobs/{id}/cancel    … 既存キャンセル（プロセスツリー kill、変更なし）
```

### 新規モジュール（バックエンド）

| モジュール | 責務 |
|---|---|
| `services/agent_cli.py` | バックエンド検出（`shutil.which("claude"/"codex")`）・バージョン取得・argv 構築。`forge_cli.py` と対になる |
| `services/agent_prompt.py` | ゴール+銘柄からエージェント指示文を組み立てる純粋関数。戦略 JSON の置き場所（`ForgeConfig.strategies_dir`）・検証コマンド・完了報告形式（最終出力に `{strategy_id, run_id}` の JSON）を明示する |
| `routers/agent.py` | `GET /api/agent/backends` / `POST /api/agent/jobs`。ジョブの観察・キャンセルは既存 `/api/jobs` 系に委ねる |
| `schemas/agent.py` | Pydantic スキーマ（OpenAPI 経由でフロント TS 型を自動生成） |

### 既存モジュールの拡張

- `services/jobs.py`: `kind="agent"` の実行に対応。claude の `--output-format
  stream-json` の JSON Lines を 1 行ずつパースし、「アシスタントの発言」「使用
  ツール名」だけを人間可読ログへ変換して `_append_log` に流す。codex 側も
  同様にイベント出力をログ変換する。`JobRecord` / `JobManager.create` の入力を
  拡張し、agent ジョブでは goal・backend を保持する（strategy_id / run_id は
  ジョブ完了時に result として判明する）
- `cli.py` / `app.py`: 非 loopback bind の判定結果を agent ルーターへ伝搬

### CLI 起動仕様

共通: `stdin=DEVNULL`・`cwd=ForgeConfig.forge_dir`・env は `build_forge_env` を再利用。

```
claude -p "<prompt>" \
  --output-format stream-json \
  --permission-mode dontAsk \
  --allowedTools "Read,Write,Edit,Bash(alpha-forge *)" \
  --max-turns 50

codex exec --sandbox workspace-write -C <forge_dir> "<prompt>"
```

- claude: `dontAsk` により許可外ツールは自動拒否（ヘッドレスで承認プロンプトが
  出ずハングしない）。ファイル操作+alpha-forge CLI のみ許可
- codex: `workspace-write` は OS レベルサンドボックス。書き込みは cwd 配下限定、
  ネットワークは既定で遮断される
- **実装時に検証すること**: codex exec のイベント出力フラグ（`--json` の有無と
  形式）、両 CLI のバージョン表示コマンド、`--max-turns 50` の妥当性。導入済み
  CLI の `--help` 実出力で確認する

## セキュリティ設計

1. **API キー不使用** — 認証・課金は各 CLI の既存ログインに完全委譲。
   visualizer はキーの保存・入力 UI を持たない
2. **ワークスペース限定** — 上記 CLI 起動仕様の通り。visualizer 独自の
   サンドボックスは実装しない（CLI 標準機能に委譲）
3. **非 loopback bind 時は機能無効** — `/api/agent/*` は 403 を返し、GUI は
   「開発」ビューを表示しない。エージェント起動は任意コード実行に近い操作で
   あり、LAN 公開サーバーの UI から他者が踏める状態にしない
4. **ログ衛生** — 既存 `mask_home` / `log_sanitize` をエージェントログにも適用
5. **外部通信の明示** — README（日英）に「本機能はユーザー自身の Claude/Codex
   CLI を起動し、それらは Anthropic / OpenAI と通信する」ことを明記する
   （alpha-forge 本体には変更を加えないため EULA §11.8 の改訂は不要）

## データフロー

1. GUI 起動時に `GET /api/agent/backends`。未検出バックエンドは選択肢から除外し、
   両方未検出ならフォームの代わりに導入案内カードを表示
2. `POST /api/agent/jobs {goal, symbol?, backend}`:
   - Pydantic バリデーション（goal 非空・長さ上限、backend は enum）
   - `resolve_forge_exe()` と対象 CLI の存在を事前確認 → 無ければ 424 + 導入案内
   - `JobManager.create(kind="agent")` → 202 `{job_id}`
3. 実行中: stream-json → 人間可読ログ → 既存 SSE（snapshot → log → status）
4. 終了: exit code と最終出力を評価。`parse_json_lenient` で `{strategy_id,
   run_id}` を抽出して `JobRecord.result` へ
5. GUI: 完了イベントで戦略・結果を再フェッチし、新戦略リンク+サマリを表示

## エラー処理

| 失敗モード | 応答 |
|---|---|
| CLI 未検出 | 424 + 導入 URL（`FORGE_NOT_FOUND_MESSAGE` と同パターンの定数を `agent_cli.py` に定義） |
| forge 未導入 / EULA 未同意 | ジョブ投入前に検出して 424。実行中に発生した場合は既存 `translate_forge_failure` でログ変換 |
| CLI 認証切れ | stderr パターンを `translate_agent_failure`（新設）で「ターミナルで `claude` / `codex` にログインしてください」へ変換 |
| ハング | env `ALPHA_VIS_AGENT_TIMEOUT`（既定 1800 秒）でタイムアウト → 既存プロセスツリー kill → status failed + ログ末尾。`claude -p` のハングは既知事象のためタイムアウトは必須 |
| 結果 JSON 抽出失敗 | ジョブ自体は completed、result 無し。GUI は「完了しましたが結果を特定できませんでした。ログを確認してください」を表示（silent fail にしない） |
| ジョブ投入直後のプロセス起動失敗 | 既存 JobManager のエラー経路に乗せ、SSE で failed を配信 |

## テスト戦略

- **単体**（pytest）: argv 構築（両バックエンド）・プロンプト組み立て・
  stream-json ログ変換・`translate_agent_failure`・検出（`shutil.which` を
  monkeypatch）
- **API**（pytest + TestClient）: バリデーション 422、CLI/forge 未検出 424、
  非 loopback 403、ジョブライフサイクル（サブプロセスを「数行ログ+結果 JSON を
  出力する偽エージェントスクリプト」に差し替え。既存 jobs テストのパターン踏襲）
- **フロントエンド**（vitest）: フォーム・ライブログ・完了サマリ・未検出カード・
  i18n（日英）
- **実機スモーク**: リリース前チェックとして手元の claude / codex で各 1 回実走。
  自動 E2E には組み込まない（認証・コスト・所要時間のため）
- カバレッジは CI 基準（Python 90% / vitest thresholds）を維持する

## ドキュメント（同一 PR に含める）

- README / README.en の機能説明+外部通信の明示（日英同期ルール）
- alforge-labs `mkdocs_src/{ja,en}/alpha-visualizer/` の対応ページ + mkdocs ビルド
  成果物再生成（リンク PR 可）
- `docs/screenshots/{ja,en}/` の再撮影（「開発」ビュー追加のため）
- `schemas/agent.py` 追加に伴う `cd frontend && pnpm run gen`（OpenAPI 型再生成）

## v1 スコープ外（後続バージョンで同基盤に積む）

- チャット型（`claude -p --resume` によるセッション継続対話）
- 自律探索（explore-strategies 相当の長時間ジョブ）
- API 直叩きバックエンド（キー管理を伴うため当面計画しない）
- エージェントジョブ専用の並列制御（v1 は既存 JobManager の同時実行数制御
  （セマフォ + active 上限）にそのまま従い、agent 専用の制限は設けない）
