# 各種ツールのバージョン確認と更新の GUI 化 設計

- 日付: 2026-08-10
- 対象リポジトリ: alpha-visualizer（API + UI）/ alpha-strike（起動時メタ出力）
- 関連: alpha-visualizer #492（`/api/setup/status` の degraded 設計）・`docs/superpowers/specs/2026-08-02-agent-develop-design.md`（ローカル限定機能の考え方）・`docs/superpowers/specs/2026-08-06-live-refresh-gui-design.md`（sync-events パイプライン）

## 背景 / 課題

バージョン情報は現状 3 か所に分散し、どれも「現在版」しか分からない。

- `GET /api/setup/status` — forge CLI の現在版のみ（`routers/setup.py` の `_parse_version`）
- `GET /api/agent/backends` — claude / codex の現在版のみ
- alpha-visualizer 自身と alpha-strike — GUI からは一切見えない

そのため「使っているツールが古いかどうか」を GUI から判断できない。alpha-forge は
`self version --json` / `self update` を既に持っているのに、GUI からその導線がない。

## ゴール

- メンテナンス画面を開くと alpha-forge / alpha-visualizer / alpha-strike の
  **現在版と最新版が並び、更新の有無が分かる**。
- 更新可能なもの（alpha-forge / alpha-visualizer）は GUI から更新まで完了できる。
  alpha-visualizer は更新後に自動で再起動し、画面が復帰する。
- 照会の失敗（オフライン・forge 未導入・未同期）で画面が壊れない。

## 非ゴール

- claude / codex CLI のバージョン管理。導入経路が各社インストーラ依存で visualizer から
  更新できない（`GET /api/agent/backends` の現在版表示は現状のまま）。
- Python / uv / pnpm など実行環境ツールの管理。
- alpha-strike の**更新実行**。稼働中の発注サーバーを GUI から再起動させない。表示のみ。
- 定期的な自動チェック・通知。画面を開いたときの取得のみ。
- Windows での alpha-visualizer 自動更新（§6 の理由により構造的に不可能）。

## 設計

### 1. alpha-visualizer — 新規モジュール

| ファイル | 責務 |
|---|---|
| `routers/versions.py` | 3 コンポーネントの照会と更新起動 |
| `schemas/versions.py` | レスポンススキーマ |
| `services/pypi.py` | PyPI から最新版を取得するだけ |

`services/pypi.py` は `urllib.request`（stdlib）を使い、**新規依存を追加しない**。
`pyproject.toml` の `dependencies` に HTTP クライアントは無く、この 1 機能のために
httpx / requests を足すのは割に合わない。timeout 5 秒、失敗時は `None` を返す。

### 2. `GET /api/versions`

```json
{"components": [
  {"id":"forge","status":"ok","current":"1.9.2","latest":"1.9.3","update_available":true,"updatable":true,"message":null,"as_of":null},
  {"id":"visualizer","status":"ok","current":"1.6.0","latest":"1.6.0","update_available":false,"updatable":true,"message":null,"as_of":null},
  {"id":"strike","status":"ok","current":"1.0.4","latest":"1.0.5","update_available":true,"updatable":false,"message":null,"as_of":"2026-08-10T09:12:00+09:00"}
]}
```

`status` は 3 値:

- `ok` — 現在版が取得できた
- `unknown` — 取得できなかった（degraded。CLI 未導入・timeout・未同期・PyPI 到達不可）
- `disabled` — 対象外（strike で `remote.enabled: false`）

`as_of` は strike 専用。値が「いつ時点のものか」を示す（§4）。他は常に `null`。

取得元:

| id | current | latest |
|---|---|---|
| forge | `alpha-forge self version --json` の `current_version` | 同 JSON の `latest_version`（GitHub Releases。**visualizer 側で再取得しない**） |
| visualizer | `alpha_visualizer.__version__` | PyPI `alpha-visualizer` |
| strike | 同期済み `_meta.json` の `version`（§4） | PyPI `alpha-strike` |

forge の最新版判定を forge 自身に委ねるのは、GitHub Releases の照会先・プレリリース
除外・dev build 判定が既に `self version` に実装済みだからである。visualizer 側に同じ
ロジックを持つと、リリース方式の変更時に 2 か所がずれる。

3 つの照会は `asyncio.gather` で並列に行い、例外は値として捕捉して個別に `unknown`
へ落とす（`routers/setup.py` の `_call_or_exc` と同じ degraded 方式）。直列だと
1 つの timeout で画面表示が数十秒ブロックされ、1 つの失敗で全体が 500 になる。

### 3. alpha-strike — 起動時にバージョンメタを書き出す

`webhook_server` の起動時に、イベントログ出力ディレクトリ（`/opt/alpha-strike/data/live/events`）へ
`_meta.json` を書く:

```json
{"component": "alpha-strike", "version": "1.0.4", "started_at": "2026-08-10T09:12:00+09:00"}
```

**ファイル名が `.jsonl` でないことが設計の要点**である。イベント走査は
alpha-strike が `event_logger.py:55` の `base_path.glob("*.jsonl")`、alpha-forge が
`live/store.py:134` の `events_path.glob("*.jsonl")` で、どちらも `_meta.json` を拾わない。
既存のイベント取り込みに一切干渉しない。

alpha-forge 側の変更は不要。`live sync-events` の rsync は `-avz --progress` のみで
`--delete` もフィルタも無いため（`commands/live.py:465-473`）、`_meta.json` は
既存の同期にそのまま乗る。

#### なぜ SSH で直接取りに行かないか

`oracle-strike` への SSH は Cloudflare Access 経由であり、Access セッションが切れていると
`cloudflared` が**ブラウザウィンドウを開いて認証を要求し**、認証しなければ接続が
タイムアウトする（2026-08-10 に実測して確認）。`ssh -o BatchMode=yes` では抑止できない。
認証しているのは ssh ではなく ProxyCommand の `cloudflared` だからである。

「画面を開いたら自動で取得」する設計と組み合わせると、**メンテナンス画面を開くたびに
ブラウザのタブが勝手に開き、30 秒待たされて失敗する**。同期済みファイルを読む方式なら
この経路が存在しない。加えて、LAN 公開しうる OSS のローカル Web サーバーに SSH 実行
経路を追加せずに済む。

### 4. alpha-visualizer — 同期済み `_meta.json` を読む

`ForgeConfig` に `live_events_dir` プロパティを追加する。forge.yaml の
`remote.local_events_path` を forge.yaml の位置基準で解決し、未設定時の既定は
`./data/live/events`（alpha-forge の `_run_sync_events` のフォールバックと同一値）。

- `<live_events_dir>/_meta.json` が読めれば `current` = その `version`、
  `as_of` = その `started_at`
- ファイルが無い / 壊れている → `status: "unknown"` ＋
  「`alpha-forge live sync-events` を実行すると表示されます」
- `remote.enabled: false` → `status: "disabled"`

**値は「最後に同期した時点」のもの**であり、リアルタイムではない。UI は `as_of` を
「最終同期」として必ず併記する（古い値を現在値だと誤認させない）。Live 画面の一括更新
（`live refresh`）を回せば自然に更新される。

### 5. `POST /api/versions/{component}/update`

対象は `forge` と `visualizer` のみ。`strike` は 400（`updatable: false`）。

ゲートは既存の `app.state.local_write_enabled` を再利用する。非 loopback 公開時に
`routers/data.py:114` / `routers/live.py:222` / `routers/pine.py:53` が既に使っている
「書き込み系ローカル限定機能」用のフラグであり、パッケージ更新はまさにその類型。
新しいフラグは追加しない。

- **forge** — `JobManager` に kind `forge_self_update` を追加し `alpha-forge self update --yes`
  を起動。202 + `JobSummary` を返し、既存の SSE 進捗にそのまま乗る。ダウンロード検証・
  スモークテスト・ロールバックは forge 側が持っているので visualizer は何もしない。
- **visualizer** — §6。

### 6. alpha-visualizer の自己更新と自動再起動

#### Windows は対象外

Windows では実行中プロセスの `alpha-vis.exe` がロックされ、pip がファイルを置換できず
必ず失敗する。`sys.platform == "win32"` のとき visualizer 行は `updatable: false` とし、
更新コマンドの提示だけ行う。方針の縮小ではなく、その経路が OS 上存在しない。

#### 事前ガード（1 つでも欠ければ 409。更新を開始しない）

1. **実行中ジョブが 0 件** — バックテスト・最適化・エージェントを巻き添えで殺さない。
2. **editable インストールでない** — `importlib.metadata` の `direct_url.json`（PEP 610）に
   `dir_info.editable` があれば拒否。開発チェックアウトに `pip install -U` を打つのは
   明確な誤りで、通せば作業中のソースが上書きされる。

#### 更新

`sys.executable -m pip install -U alpha-visualizer` をジョブ（kind `visualizer_self_update`）
として起動する。uv 製 venv には pip が入っていないことが多いため、
`sys.executable -m pip --version` に失敗したら
`uv pip install --python <sys.executable> -U alpha-visualizer` へフォールバックする。
どちらも使えなければ 409 ＋ 手動コマンドの提示。

#### 再起動

ジョブが**成功したときだけ**行う。

1. `cli.py` が `app.state.uvicorn_server = server` を持たせる（`server` 構築後・`run()` 前）。
2. ルーターは `server.should_exit = True` と `app.state.restart_requested = True` を立てるだけ。
3. `os.execv` は `server.run()` から戻った**後の `cli.py` 側**で行う。ここで exec すれば
   ソケットは解放済みで、再バインドが `EADDRINUSE` で落ちない。
4. 再起動先は `os.execv(sys.executable, [sys.executable, "-m", "alpha_visualizer.cli", *sys.argv[1:]])`。
   `cli.py` に `if __name__ == "__main__": cli()` を追加する。起動方法（`alpha-vis` /
   `uv run alpha-vis` / `python -m`）に依らず同じ経路になる。

#### フロントの復帰

更新ジョブ完了後に「再起動中…」を表示し、`/health` を 1 秒間隔でポーリング（上限 60 秒）。
復帰したらページをリロードする。60 秒で復帰しなければ「手動で `alpha-vis serve` を
実行してください」を表示する（無限スピナーにしない）。

### 7. UI — メンテナンス画面

`MaintenanceScreen` に「バージョン」セクションを孤児削除の**上**に追加する。3 行の
テーブルで コンポーネント / 現在版 / 最新版 / 状態 を並べる。

- `update_available && updatable` の行にだけ更新ボタンを出す
- strike は更新ボタンを出さず、代わりに `as_of`（最終同期）と、VM 上での更新手順
  （alpha-strike の `docs/ops/deployment.md`）へのリンクを出す
- `status: "unknown"` は「不明」＋ `message` を出す。エラーバナーにしない（初回セットアップ中や
  オフラインではむしろ正常系）
- `status: "disabled"` の strike は行ごと出さない

ナビゲーションは変更しない（`/maintenance` は既にナビにある）。

## エラー処理

| 事象 | 挙動 |
|---|---|
| PyPI 到達不可 / timeout | 該当行だけ `latest: null`。`current` は表示を維持 |
| forge 未導入 | forge 行 `status: "unknown"`。strike 行は影響を受けない（forge 経由でないため） |
| `_meta.json` が無い / 壊れている | strike 行 `status: "unknown"` ＋ sync-events の案内 |
| forge 更新の失敗 | ジョブ失敗として stderr 込みで表示。ロールバックは forge 側 |
| visualizer 更新の失敗 | ジョブ失敗として表示し、**`os.execv` を呼ばない** |

最後の 1 行が最も重要な設計判断である。壊れた状態で再起動して二度と起動しないのが
最悪のシナリオなので、再起動は成功パスにのみ紐づける。

## テスト

- `services/pypi.py` — 正常 / 404 / timeout / 不正 JSON の 4 ケース
- `routers/versions.py` — 3 コンポーネントの `ok` / `unknown` / `disabled`、
  および**1 つの照会失敗が他 2 つを巻き込まない**こと（degraded 設計の意図そのもの）
- `ForgeConfig.live_events_dir` — `remote.local_events_path` 指定時 / 未指定時の既定 /
  forge.yaml 基準の相対解決
- ガード — 非 loopback で 403、実行中ジョブありで 409、editable で 409、
  `win32` で `updatable: false`
- 再起動 — `os.execv` をモックし「ジョブ成功時のみ呼ばれる」「失敗時は呼ばれない」を検証。
  これは実装の観察ではなく「壊れたまま再起動しない」という意図の検証（Rule 6）
- フロント — バージョンセクションの 4 状態（更新あり / 最新 / 不明 / 更新不可）、
  strike 行の `as_of` 表示、再起動ポーリングの復帰・タイムアウト
- alpha-strike — `_meta.json` が起動時に書かれること、および**`load_events` が
  `_meta.json` を拾わないこと**（混入しないという設計前提の回帰テスト）

## 作業範囲

alpha-visualizer と alpha-strike の 2 リポジトリ。**alpha-forge の変更は不要**。

alpha-visualizer 側（同一 PR）:

1. `schemas/versions.py` 追加に伴い `cd frontend && pnpm run gen`（OpenAPI + TS 型再生成）
2. UI に視覚的変更が入るため `docs/screenshots/{ja,en}/` を再撮影
3. `uv run pytest tests/` ・ `uv run ruff check src/ tests/` ・ `cd frontend && pnpm run build`
4. 公開設定（`remote.local_events_path` の参照）に触れるため
   `alforge-labs/mkdocs_src/{ja,en}/alpha-visualizer/` の該当ページを更新し
   `uv run mkdocs build` の成果物も含める

alpha-strike 側（別 PR）:

1. 起動時の `_meta.json` 出力とテスト
2. PyPI リリース後、VM 上で更新して初めて strike 行が `ok` になる

## 既知の制約

- alpha-strike の版が表示されるのは、`_meta.json` を書く版を VM へデプロイし、
  かつ `live sync-events` を 1 回以上回した後である。それまでは `unknown` ＋
  案内文が出る（degraded として正常な状態）。
- strike の `current` は最終同期時点の値であり、リアルタイムではない。
  UI は `as_of` を必ず併記してこれを明示する。
