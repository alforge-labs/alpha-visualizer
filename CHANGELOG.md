# Changelog

alpha-visualizer の全バージョン変更履歴です。

> **License Change Notice (v0.6.0+):** v0.6.0 以降、ライセンスは MIT から Apache-2.0 に変更されました。v0.5.0 以前のリリースは引き続き MIT ライセンスです。詳細は [LICENSE](LICENSE) を参照してください。


## [0.5.0] - 2026-05-18


### その他

- バージョン 0.5.0 にバンプ



### バグ修正

- **security**: CodeQL alert #42 #43 を解消 (#200)



## [0.4.0] - 2026-05-16


### その他

- **release**: v0.4.0 — TradingView シグナル時系列チャートを正式リリース (#199)



### バグ修正

- **api**: trades のソースを metrics_json.trades 優先に切替（PascalCase 互換） (#198)



### 新機能

- **api**: backend に OHLC endpoint と Trade.exit_price/sl_price/tp_price を追加 (#189) (#194)


- **client**: frontend に OHLC API client と useStrategyHistorical hook を追加 (#190) (#195)


- **charts**: StrategySignalChartTV (candlestick + markers + priceLine) を StrategyScreen に追加 (#191) (#196)


- **charts**: StrategySignalChartTV に regime change markers を追加 (#186) (#197)



## [0.3.0] - 2026-05-16


### その他

- **release**: v0.3.0 — vis → alpha-vis CLI リネームを正式リリース (#193)



### ドキュメント

- CHANGELOG を v0.2.0 に更新


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


- バージョン 0.2.0 にバンプ



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



