# Changelog

alpha-visualizer の全バージョン変更履歴です。

> **License Change Notice (v0.6.0+):** v0.6.0 以降、ライセンスは MIT から Apache-2.0 に変更されました。v0.5.0 以前のリリースは引き続き MIT ライセンスです。詳細は [LICENSE](LICENSE) を参照してください。

> **⚠ 破壊的変更の履歴 / Breaking changes:**
> - **v1.0.0**: 安定版 GA。以降は semver に従います / Stable GA; semver applies from here on.
> - **v0.3.0**: CLI コマンド名を `vis` から `alpha-vis` にリネーム（macOS 標準 `/usr/bin/vis` との衝突回避）。旧名は使えません / The CLI was renamed from `vis` to `alpha-vis`; the old name no longer works.

_(EN) Entries below are generated from Conventional Commits (Japanese). Group names: 新機能 = Features, バグ修正 = Bug fixes, リファクタリング = Refactoring, パフォーマンス改善 = Performance, ドキュメント = Docs, テスト = Tests, その他 = Chore. Breaking commits are tagged 破壊的変更._


## [1.4.0] - 2026-08-03


### その他

- **deps**: Python 依存 4 件をまとめて更新 (#478)



### バグ修正

- AI 戦略開発 v1 のフォローアップ 6 件（権限強化・堅牢化・a11y・完了表示・検出取得・テスト） (#479)



### 新機能

- AI 戦略開発（Agent Develop）v1 (#471)



## [1.3.5] - 2026-08-02


### バグ修正

- チャート上のホイールでページがスクロールしない問題を直す (#465)



## [1.3.4] - 2026-08-01


### バグ修正

- ライブ画面の指数系列を主系列と混同しない色・線種にする (#464)



## [1.3.3] - 2026-08-01


### 新機能

- エクイティチャートに系列凡例を追加する (#463)



## [1.3.2] - 2026-08-01


### 新機能

- EULA 未同意で forge が Abort した際に同意手順を案内する (#462)



## [1.3.1] - 2026-08-01


### バグ修正

- forge CLI の実行ファイル名を alpha-forge に修正して実行系機能を復旧 (#461)



## [1.3.0] - 2026-08-01


### CI/CD

- カバレッジ計測（fail_under/thresholds）と mypy を導入し既存型エラーを 0 化 (#449)



### その他

- CLI の help・起動メッセージを日英併記にし DB 不在警告へ次の一歩を追加 (#435)


- UI 文言の平易化・統一（snake_case 露出/独自用語/CLI 前提文言/表記ゆれ） (#439)


- PyPI メタデータを更新（Production/Stable・Python 3.12–3.14・Doc URL 英語入口） (#457)


- API 境界の小粒改善（strategy_id 規約統一・/health の mask_home・WFO/Optimize 遅延フェッチ） (#456)


- CodeQL py/empty-except 指摘に対応（フォールバック意図のコメントを明記） (#459)


- audit-licenses の DEV_ONLY を新 dev 依存に追従し THIRDPARTY_LICENSES.txt を再生成 (#460)



### ドキュメント

- README に同梱サンプルの導線・Live/Ideas スクショ・FAQ リンクを追加する (#410)


- CHANGELOG からリリース作業ノイズを除外し破壊的変更の履歴と英語注記を追加 (#458)



### バグ修正

- 起動後に生成された DB を初回アクセス時に遅延接続する (#403)


- IS/OOS 指標を按分疑似値から equity 実分割計算に変更 (#404)


- 存在しない戦略 ID の詳細ページを永久スケルトンでなく 404 表示にする (#405)


- 最大DDの色判定を正値規約に合わせ絶対値ベースに統一する (#406)


- 最適化タブの試行数を DB の n_trials で表示し optimize run を切替可能にする (#407)


- 未定義の /api/* パスが SPA フォールバックで 200 + HTML を返す問題を修正 (#415)


- アプリバージョンを UI・/health・OpenAPI で実バージョンに連動させる (#416)


- forge CLI 未検出を 503 + 機械可読 code で返し UI は表示言語のみの文言にする (#417)


- 整数値の指標・取引数が「119.0」「0.00」と小数付きで表示される問題を修正 (#418)


- 0 トレード run のセンチネル Sharpe/Sortino -100 を注釈付き「—」表示にする (#419)


- Compare サイドカードの null 指標が 0.00 表示になり指標テーブルと食い違う問題を修正 (#420)


- WFO/IS-OOS 画面のウィンドウ数・分割比サブタイトルを実データから導出する (#421)


- サーバー再起動後のジョブ 404 を握りつぶして永久ポーリングし続ける問題を修正 (#422)


- 再実行ダイアログの「上書きされます」を実挙動（追加・履歴保持）の説明に修正 (#423)


- 422 の detail を文字列へ正規化し Browse に ErrorBanner + 再試行導線を追加 (#424)


- ConfirmDialog に初期フォーカス・フォーカストラップ・復帰を実装し modal として機能させる (#425)


- Compare/Detail の内部スクロールコンテナをキーボード操作可能な region にする (#426)


- 375px のフィルタ行崩れ・指標列不可視と 1280px の右列切れを修正 (#427)


- Compare ヘッダーに全銘柄・期間を表示し差分記号を ▲改善/▼悪化 + 凡例に統一 (#438)


- レシピ行の比較チェックボックス aria-label に strategy_id を含めて一意化 (#451)



### パフォーマンス改善

- GZip 圧縮と静的アセットの Cache-Control を追加する (#408)


- 一覧 API をスカラー SELECT + limit/offset 化し compare ids に上限を設ける (#409)


- 戦略 1 件取得の全件ロード線形走査を解消（DB は WHERE・JSON は対象ファイル直読み） (#428)


- sparkline を軽量 API 化し 2MB フル詳細の 2 連 fetch とエラー握りつぶしを解消 (#429)



### 新機能

- 指標ツールチップを全指標に拡張し目安値付き・タッチ/キーボード対応にする (#411)


- アプリ内ヘルプ導線を追加する（docs/FAQ リンク・IS/OOS・WFO の概念説明） (#412)


- forge 計算済みの未表示指標を UI に出す（コスト実績・Kelly・期待値・勝率CI 等） (#413)


- Run History に 2 run 選択の比較ビューを追加する（指標差分 + equity 重ね描き） (#414)


- ルート共通の errorElement を追加し描画例外を i18n エラー画面 + 回復導線で受ける (#430)


- POST /api/run に同時実行ガードを追加し上限超過は 429 を返す (#431)


- アプリロガー設定と --log-level を追加しポート衝突時は案内付きで失敗させる (#432)


- 非 loopback バインド時の明示警告と TrustedHostMiddleware を導入する (#433)


- P&L・エクイティ・評価額に開始時評価額と口座通貨建ての前提を明示する (#434)


- モンテカルロに全期間累積の明記・趣旨説明・用語ツールチップを追加 (#436)


- Browse に新規戦略作成（既存から複製）への導線を追加 (#437)


- 取引タブに保有期間分布ヒストグラム（勝敗色分け + ビン別勝率/平均リターン表）を追加 (#440)


- 取引一覧に方向・勝敗・期間フィルタとページサイズ選択を追加 (#441)


- rolling チャートに年率ボラティリティの系列切替を追加 (#442)


- メトリクスタブに期間プリセット（YTD/1Y/3Y/5Y）のサブピリオド再計算を追加 (#443)


- Performance タブに年別サマリテーブル（リターン/ベンチ超過/年次MaxDD/取引数/勝率）を追加 (#444)


- 全 run 横断の Runs ページ（検索・銘柄・期間・Sharpe 下限・ソート）を追加 (#445)


- フルレポート（印刷用ビュー→PDF 保存）ページと Detail からの導線を追加 (#446)


- Compare にポートフォリオ合成（ウェイト指定・加重合成エクイティ・分散効果の確認）を追加 (#447)


- 任意ベンチマーク銘柄のオーバーレイと対ベンチ指標（β/α/IR/超過）を追加 (#448)


- run の実行時パラメータを Detail に表示する（forge#1356 の params_json 連携） (#450)


- エクイティチャートに対数スケール（Log）トグルを追加 (#452)


- 戦略のお気に入り（スター + Starred レンズ・localStorage 永続）を追加 (#453)


- 最適化ビューにパラメータ重要度（Spearman 順位相関）バーを追加 (#454)


- 取引一覧の行クリックで該当期間へチャートジャンプ（共有 viewport + 概要タブ切替） (#455)



## [1.2.2] - 2026-07-29


### バグ修正

- **browse**: 戦略選択時に sparkline 取得が無限ループして API を叩き続ける問題を修正 (#346)



## [1.2.1] - 2026-07-28


### バグ修正

- audit-licenses の dev 除外を名前の表記ゆれに耐えるようにする (#340)


- **deps**: Dependabot のセキュリティアラート 2 件とバージョン更新 3 件を解消 (#341)


- **browse**: 最終実行の日付が折り返して行高が 55px に膨らむ問題を修正 (#344)


- **design**: 未定義のまま参照されていた CSS 変数 3 種を定義し、再発をテストで防ぐ (#345)



## [1.2.0] - 2026-07-27


### テスト

- **e2e**: Live ページを撮影対象に追加し、overlay の色・重複ラベル・TZ 依存を解消 (#332)



### バグ修正

- **compare**: 戦略未選択時に永久ローディングになる不具合を修正 (#328)



### 新機能

- **live**: Live ページの Equity 表示をリッチ化（KPI・ベンチマーク比較・建玉テーブル） (#329)


- **browse**: ブラウズ画面をレシピ単位に畳んで見やすくする（SP1） (#333)


- **browse**: 銘柄カバレッジ表で未実行レシピの偏りを可視化する（SP2） (#338)


- **maintenance**: 孤児バックテスト結果を掃除する /maintenance 画面を追加（SP3 フェーズ2） (#339)



## [1.1.0] - 2026-07-24


### テスト

- **e2e**: TV チャートの Playwright ビジュアル回帰テストを追加 (#325)



### バグ修正

- CodeQL の指摘 7 件を解消 (#326)



### 新機能

- **charts**: EquityDrawdownPaneTV にレジーム背景バンドを実装 (issue #317) (#323)


- **charts**: TV チャートの双方向 viewport sync を実装 (issue #318) (#324)



## [1.0.1] - 2026-07-23


### CI/CD

- **deps**: bump actions/setup-node from 6 to 7 (#310)



### その他

- **charts**: lightweight-charts PoC 後の clean-up とインフラ整備 (#320)


- **deps**: Dependabot の依存更新とセキュリティアラート 7 件を解消 (#322)



### バグ修正

- **web**: EN 言語切替をナビ・チャート軸ロケール・Data table 表記に反映 (issue #315) (#316)


- **web**: 残存していた素テキストのローディング表示 6 箇所を共有 Loading へ移行 (issue #266) (#321)



## [0.9.0] - 2026-07-19


### CI/CD

- **deps**: bump actions/cache from 5 to 6 (#276)


- **deps**: bump actions/checkout from 6 to 7 (#251)



### その他

- **deps-dev**: bump hypothesis from 6.155.2 to 6.155.7 (#252)


- **deps**: bump fastapi from 0.137.0 to 0.138.0 (#253)


- **deps-dev**: bump bump-my-version from 1.2.2 to 1.4.1 (#254)


- **deps-dev**: bump pytest from 9.1.0 to 9.1.1 (#255)


- **deps-dev**: bump ruff from 0.15.17 to 0.15.18 (#256)


- **deps**: bump click from 8.4.1 to 8.4.2 (#279)


- **deps-dev**: bump hypothesis from 6.155.7 to 6.156.1 (#280)


- **deps-dev**: bump ruff from 0.15.18 to 0.15.20 (#281)


- **deps**: bump sqlalchemy from 2.0.50 to 2.0.51 (#283)


- **deps**: bump fastapi from 0.138.0 to 0.139.0 (#282)


- THIRDPARTY ライセンスを v0.9.0 向けに再生成



### テスト

- **e2e**: シェア導線（カード保存・X 共有インテント）の E2E を追加 (#290)


- 実行系・書き込み系エンドポイントの DB モード（strategies.use_db）テストを追加 (#305)



### ドキュメント

- pre-release を CI 委譲フローに刷新し audit-licenses の除外リストを現依存に同期 (#277)


- X (@Alforge_bot) フォローバッジと project.urls を追加 (#278)



### バグ修正

- /api/run のレビュー第2ラウンド対応（EULA プロンプトの fail-fast 化・引数注入対策ほか） (#295)


- ジョブ基盤のレビュー第2ラウンド対応（結果のパスマスク・shutdown 時の孤児化防止ほか） (#297)



### 新機能

- **cli**: serve 起動バナーに AlphaForge への送客 CTA を追加（C3） (#275)


- **ui**: AlphaForge 送客導線を Web UI に常設し strike→forge 取込経路を明示 (#284)


- **share**: バックテスト結果の SNS シェアカード生成機能を追加（C5 バイラルループ） (#285)


- **share**: シェアカードを Compare / Live 画面へ展開 (#286)


- **share**: X 共有インテントボタンと UTM 計測を追加 (#287)


- **share**: X 共有を Compare / Live 画面へ展開し 280 字ガードを追加 (#288)


- **browse**: 初回起動（データなし）の空状態にオンボーディング CTA を追加 (#289)


- /api/run を堅牢化（--json run_id 直接取得・タイムアウト・timeframe 除去・実行ログ表示） (#294)


- 非同期ジョブ基盤を追加（optimize/WFT の GUI 実行・SSE 進捗・キャンセル） (#296)


- パラメータチューニングループ UI を追加（編集→一時実行→比較→明示保存） (#298)


- WFT ジョブに --save を付与して WFO タブへ自動反映（forge#1293 対応） (#302)


- Run History / Browse / Backtest タブでチューニング試行ランを区別表示 (#304)


- 既存戦略の複製ベースの新規戦略作成を追加 (#306)


- WFO タブを非 sharpe 指標の WFT 結果に対応 (#307)


- Backtest 詳細に carry_adjusted（FX キャリー近似）を表示 (#309)



## [0.8.0] - 2026-06-28


### その他

- **deps**: bump fastapi from 0.136.3 to 0.137.0 (#244)


- **deps**: bump starlette from 1.0.1 to 1.3.1 (#248)


- **deps-dev**: bump pytest from 9.0.3 to 9.1.0 (#246)


- **deps-dev**: bump ruff from 0.15.15 to 0.15.17 (#245)


- **deps**: bump click from 8.3.3 to 8.4.1 (#238)


- **deps-dev**: bump hypothesis from 6.155.1 to 6.155.2 (#235)


- **deps-dev**: bump vite from 8.0.12 to 8.0.16 in /frontend (#247)


- **deps**: bump react-router-dom from 7.15.0 to 7.17.0 in /frontend (#242)


- **deps**: 推移的依存のセキュリティ脆弱性を解消（undici/js-yaml/@babel/core/esbuild） (#250)


- **deps**: bump pydantic-settings from 2.14.0 to 2.14.2 (#249)


- **deps-dev**: bump vitest (#240)



### ドキュメント

- **readme**: AlphaForge への送客 CTA を先頭に追加 (#257)



### バグ修正

- **a11y**: セマンティック色とアクティブchipの accent を WCAG AA に調整 (#271)


- **web**: ハードコード色一掃 (#264) とエラー/再実行 UX 改善 (#265) (#273)



### 新機能

- **frontend**: 最適化結果のパラメータヒートマップビューを追加 (#243)


- **a11y**: キーボード操作・ARIA・ランドマーク・lang・コントラストの改善（Critical+High） (#268)


- **a11y**: チャートのテキスト/データ代替・キーボード/SR 対応（#262） (#270)


- **a11y**: candlestick(signal) チャートに OHLC データテーブル代替を追加 (#272)


- **web**: Loading スケルトン共有化・Intl 桁区切り・OS テーマ追従 (Refs #266) (#274)



## [0.7.3] - 2026-06-07


### その他

- **deps**: bump starlette from 1.0.0 to 1.0.1 (#220)



### バグ修正

- **e2e**: playwright.samples.config.ts の webServer を alpha-vis serve に修正し CI に e2e:samples スモークを追加 (#232) (#233)



### 新機能

- **charts**: TradingView lightweight-charts を既定レンダラに反転 (#231) (#234)



## [0.7.2] - 2026-06-07


### CI/CD

- SQLite drift check を論理比較化し uv バージョンを固定 (#223) (#224)



### ドキュメント

- **screenshots**: README スクショを主役が切れないよう撮り直し＋相関ヒートマップ追加 (#219)



### バグ修正

- **packaging**: wheel/sdist に frontend の static/ を同梱する (#225) (#228)


- **config**: <forge-dir>/forge.yaml を FORGE_CONFIG より優先する (#226) (#229)


- **logging**: DB 欠落時の起動メッセージを実挙動に一致させる (#227) (#230)



### 新機能

- **live**: Live 一覧ページを追加し combine portfolio へ UI 導線を開通 (#222)



## [0.7.1] - 2026-06-02


### CI/CD

- **deps**: bump idna from 3.13 to 3.15 (#203)


- **deps**: Python の Dependabot を pip から uv エコシステムへ切替 (#213)



### その他

- **deps-dev**: bump @types/node from 25.7.0 to 25.9.1 in /frontend (#207)


- **deps**: bump sqlalchemy from 2.0.49 to 2.0.50 (#214)


- **deps-dev**: bump ruff from 0.15.12 to 0.15.15 (#216)


- **deps**: bump fastapi from 0.136.1 to 0.136.3 (#217)


- **deps-dev**: bump hypothesis from 6.152.4 to 6.155.1 (#218)


- **deps**: bump pandas from 3.0.2 to 3.0.3 (#215)


- **deps-dev**: bump @vitejs/plugin-react in /frontend (#208)



## [0.7.0] - 2026-05-30


### CI/CD

- **deps**: bump pnpm/action-setup from 4 to 6 (#202)



### バグ修正

- **strategies**: use_db=true で DB 欠落時に JSON へ黙ってフォールバックせず Fail Loud (Closes #210) (#212)



### 新機能

- **live**: live 実績を JSON ファイルから SQLite 直読みへ移行 (Closes #209) (#211)



## [0.6.0] - 2026-05-18


### その他

- ライセンスを MIT から Apache-2.0 に変更 (#201) [**破壊的変更**]



## [0.5.0] - 2026-05-18


### バグ修正

- **security**: CodeQL alert #42 #43 を解消 (#200)



## [0.4.0] - 2026-05-16


### バグ修正

- **api**: trades のソースを metrics_json.trades 優先に切替（PascalCase 互換） (#198)



### 新機能

- **api**: backend に OHLC endpoint と Trade.exit_price/sl_price/tp_price を追加 (#189) (#194)


- **client**: frontend に OHLC API client と useStrategyHistorical hook を追加 (#190) (#195)


- **charts**: StrategySignalChartTV (candlestick + markers + priceLine) を StrategyScreen に追加 (#191) (#196)


- **charts**: StrategySignalChartTV に regime change markers を追加 (#186) (#197)



## [0.3.0] - 2026-05-16


### ドキュメント

- CLAUDE.md の重複と冗長を整理 (#181)



### バグ修正

- **release**: bump 直後に uv lock を挟んで uv.lock drift を防ぐ (#179)



### 新機能

- pnpm 移行 + minimumReleaseAge=3 days (#182)


- **charts**: TradingView lightweight-charts を BacktestScreen の equity+drawdown に PoC 導入 (#180) (#183)


- **charts**: RollingMetrics / WFO equity / CompareEquity を lightweight-charts へ移行 (#185) (#188)


- CLI コマンドを vis → alpha-vis にリネーム（macOS BSD vis(1) 衝突解消） (#192) [**破壊的変更**]



## [0.2.0] - 2026-05-11


### CI/CD

- frontend ジョブに npm run build (tsc -b && vite build) を追加（Closes #74） (#79)


- Lighthouse CI ジョブを追加 (#136)


- E2E fixture drift check ジョブを追加 (#161)


- Lighthouse CI の閾値を実測ベースで強化 + 運用ドキュメント追加 (#162)


- **deps**: bump github/codeql-action from 3 to 4 (#83)


- **deps**: bump actions/cache from 4 to 5 (#85)


- **deps**: bump actions/upload-artifact from 4 to 7 (#86)


- **deps**: bump astral-sh/setup-uv from 4 to 7 (#87)


- **deps**: bump actions/setup-node from 4 to 6 (#84)


- **deps**: bump actions/checkout from 4 to 6 (#168)



### その他

- alpha-forge/alpha-strike と同様のリリース管理を追加（release.sh・cliff.toml・CHANGELOG） (#42)


- Dependabot version updates と CodeQL ワークフローを追加 (#82)


- **deps-dev**: bump the eslint group across 1 directory with 2 updates (#88)


- **deps-dev**: bump @types/node from 24.12.2 to 25.6.2 in /frontend (#89)


- **deps-dev**: bump vite from 8.0.10 to 8.0.11 in /frontend (#92)


- **deps**: bump react-router-dom from 6.30.3 to 7.15.0 in /frontend (#91)


- **deps-dev**: bump globals from 17.5.0 to 17.6.0 in /frontend (#170)


- **deps-dev**: bump storybook from 9.1.20 to 10.3.6 in /frontend (#169)


- **deps-dev**: bump @storybook/react-vite in /frontend (#171)


- Dependabot に storybook グループを追加 (#174)



### テスト

- フロントエンド単体テストを追加し CI で実行（Closes #58） (#77)


- Playwright E2E スモークテストを追加し CI で実行（Closes #59） (#78)


- E2E fixture forge.db に sma_cross 用 WFO データを seed (#122)


- services 純関数 + Monte Carlo に property-based testing を追加 (#134)



### ドキュメント

- 関連リンクを Alforge Labs 公式サイトに変更 (#41)


- OSS 公開に向けてリポジトリドキュメントを整備（README / CONTRIBUTING / SECURITY / 自動スクリーンショット） (#80)


- pages/ vs screens/ 規約を ADR で明文化し BrowseScreen を切り出し（PR-7: F2） (#99)


- **services**: compute_drawdown の正値入力前提を docstring に明記 (#156)


- **adr**: ConditionNode の discriminated union 設計を ADR-0004 で確定 (#157)


- FORGE_CONFIG 環境変数の運用を README で明示 (#160)



### バグ修正

- tsc -b で残っていた既存の型エラー 4 件を修正 (#73)


- optimize.py の DB 障害レスポンスを 404 から 500 に修正 (#121)


- **frontend**: API 404 を「データなし」UI として表示する (#125)


- OpenAPI スキーマと TS 型を再生成して drift を解消 (#166)


- react と react-dom を 19.2.6 に揃え、Dependabot に react グループを追加 (#167)


- **optimize**: best_metric が非有限値・データ不在時に null を返し、フロントは '—' で表示 (#172)


- **security**: CodeQL の path-injection / log-injection 等 14 件のアラートを解消 (#175)


- **app**: vis serve 起動時の空 forge.db 生成を抑止 (Closes #173) (#176)


- alpha-forge の DB ファイル名デフォルト変更に追従 (#177)



### パフォーマンス改善

- **frontend**: bundle 最適化（lazy + manualChunks） (#133)



### リファクタリング

- Repository Pattern を導入し create_engine 重複を排除（PR-1: B1） (#93)


- ドメイン例外階層と統一 exception_handler を導入（PR-2: B4） (#94)


- /api/strategies の N+1 をバッチ取得で解消（PR-3: B6） (#95)


- results.py のヘルパ群を services 層に切り出し（PR-4: B3） (#96)


- tests/test_routers.py を 8 ファイルに分割し factories で seed を集約（PR-5: B2） (#97)


- **frontend**: mock fallback を IS_DEV ガードで囲み PROD bundle から除外 (#100)


- フォーマッタを lib/format.ts に集約（PR-9: F7） (#101)


- useFetchByKey で useBacktestData の 6 hook を集約（PR-10: F5） (#102)


- useStrategyList を 6 hook に SRP 分割（PR-11: F4） (#103)


- **types**: api/types.ts のエスケープハッチを ISP 観点で 4/5 削減 (#104)


- charts/visx/ と components/charts/ の責務分離 ADR + 3 チャート整理（PR-13: F3） (#105)


- **test**: 生 CREATE TABLE を db.py の MetaData に統一 (#123)


- **services**: live.py / wfo.py の整形ロジックを services/ に切り出し (#127)


- **types**: ConditionNode を discriminated union に昇格 (#128)


- **charts**: 4 chart の計算ロジックを lib/ の純関数に集約 (Batch 1) (#129)


- **charts**: DrawdownDetail / WFOTimeline の計算を lib/ に集約 (Batch 2) (#130)


- **frontend**: IdeasPage (498 行) を Container/Presentational に分離 (#131)


- **frontend**: openapi-typescript 移行 Phase 2 — 13 型を生成型 alias に (#152)


- **schemas**: EquityCurve 型名衝突を解消 (#153)


- services/wfo.py / lib/wfo.ts の同名衝突を解消 (#154)


- **schemas**: regime_series / regime_breakdown を Pydantic フィールド化 (#155)


- **charts**: OptimizeScatter / AnnualReturnsBar の C/P 分離 (#159)



### 新機能

- POST /api/run エンドポイントを追加して Run ボタンを動作させる (#60)


- WFO 合成エクイティカーブの計算と返却を実装（#44） (#61)


- Detail 画面にベンチマーク指標（alpha/beta/IR/Correlation）を表示する (#62)


- 年次リターン（annual_returns）バーチャートを Performance タブに追加 (#46) (#63)


- 最適化結果ビュー（Optimize タブ）を追加（Closes #47）


- 戦略構造ビューを追加（指標・条件・リスク管理の可視化） (#65)


- Ideas ページを追加（ステータス・タグフィルタ・戦略リンク対応） (#66)


- ダーク/ライトテーマ切替 UI トグルを追加（Closes #50） (#67)


- CSV / PNG エクスポート機能を追加（Closes #51） (#68)


- Browse 画面の selectedId / compareIds を URL クエリに同期（Closes #52） (#69)


- グローバル検索（Cmd+K）コマンドパレットを追加（Closes #53） (#70)


- モバイル/タブレット対応（レスポンシブブレークポイント整備）（Closes #54） (#71)


- Compare 画面に戦略間相関ヒートマップを追加（Closes #55） (#72)


- レジーム / HMM ステートを Equity 上に重畳して可視化（Closes #56） (#75)


- ライブ実績ビューを追加し、バックテストとの期間整合 diff を表示（Closes #57） (#76)


- Pydantic v2 schemas を新設し 7 endpoint に response_model= を付与（PR-6: B5） (#98)


- **schemas**: detail endpoints の Pydantic 化 (#124)


- **frontend**: openapi-typescript で TS 型自動生成 (#126)


- **frontend**: Storybook 9 を導入し主要 Presentational コンポーネントのストーリー作成 (#137)


- **frontend**: Storybook 拡張 - 主要 Screen 4 つにストーリー追加 (#158)


- **samples**: OSS 同梱サンプルデータセットを追加 (8 戦略 × 5 銘柄 × 5 年) (#178)



## [0.1.1] - 2026-05-05


### その他

- MIT License を追加し v0.1.1 にバージョンアップ (#40)



## [0.1.0] - 2026-05-05


### その他

- bump-my-version を設定して /pre-release コマンドを有効化 (#3) (#10)


- THIRDPARTY_LICENSES.txt を初回生成してリポジトリに追加 (#5) (#13)


- org 移管に伴い PyPI publish 用メタデータを整備 (#38)



### バグ修正

- vis serve に forge.yaml 読込を実装し DB ファイル名のハードコードを解消 (#20) (#22)


- Browse 画面で latest_* が undefined の戦略でクラッシュする問題を修正 (#23) (#25)


- release workflow に contents:read を追加し private repo の checkout を許可 (#39)



### リファクタリング

- visualizer/ ディレクトリを frontend/ にリネーム (#6)



### 新機能

- alpha-visualizer リポジトリの初期セットアップ（vis CLI 基盤）


- alpha-visualizer へ dashboard 機能を移植（vis serve）


- CLAUDE.md・スラッシュコマンド・Codexスキルを alpha-forge から移植 (#2)


- タグ push 時に PyPI へ自動公開する release ワークフローを追加 (#4) (#11)


- alpha-forge/visualizer の Atelier/Lab リデザインを frontend/ へ全面同期 (#21)


- list_strategies のレスポンスに symbol / timeframe / max_drawdown / profit_factor / win_rate を追加 (#24) (#26)


- Browse / Compare 画面に Atelier/Lab + 言語トグルをグローバル配置 (#19) (#27)


- Strategy Ledger に Group By（None / Symbol / TF / Sharpe Tier）を追加 (#29) (#30)


- Browse 画面に §3 Symbol Atlas（資産クラス別の銘柄カードグリッド）を追加 (#32) (#33)


- Browse 画面に §2 Saved Views（プリセットレンズ）を追加 (#34) (#35)


- Browse 画面に §1 Heroline + 動線・スクロール改善 + SPA fallback (#36, #31) (#37)



