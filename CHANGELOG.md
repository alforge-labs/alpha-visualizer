# Changelog

alpha-visualizer の全バージョン変更履歴です。


## [unreleased]


### 機能追加

- レジーム / HMM ステートを EquityChart の背景帯として可視化、Risk タブにレジーム別サマリーカードを追加 (Closes #56)


### ドキュメント

- 関連リンクを Alforge Labs 公式サイトに変更 (#41)



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



