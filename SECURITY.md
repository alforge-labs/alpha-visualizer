# セキュリティポリシー

[English](SECURITY.en.md) | **日本語**

## サポート対象バージョン

`alpha-visualizer` は **最新のマイナーリリース** に対してセキュリティパッチを提供します。

| バージョン | サポート状況 |
|---|---|
| 0.1.x | ✅ サポート中 |
| < 0.1 | ❌ サポート対象外 |

`pyproject.toml` の `version` フィールドが現在のリリースを示します。

## 脆弱性の報告

セキュリティ上の脆弱性を発見された場合は、**公開 Issue を作成しないでください**。攻撃者にヒントを与えてしまうのを避けるためです。

代わりに、以下のいずれかの方法でプライベートにご連絡ください。

### 推奨: GitHub Private Vulnerability Reporting

本リポジトリは GitHub の [Private Vulnerability Reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) を有効化しています。報告者・メンテナー間でのみ閲覧可能なドラフト Security Advisory を作成でき、修正完了後にそのまま CVE 採番・公開アドバイザリ発行に進めます。

1. <https://github.com/alforge-labs/alpha-visualizer/security/advisories/new> を開く
   （または リポジトリ → **Security** タブ → **Report a vulnerability**）
2. フォームに以下を記載
   - 影響を受けるバージョン
   - 再現手順
   - 想定される影響範囲（情報漏洩 / RCE / DoS など）
   - 可能であれば修正案

### 代替: メール

GitHub アカウントを利用できない場合は [security@alforgelabs.com](mailto:security@alforgelabs.com) 宛にご連絡ください。受領確認後、必要に応じて Private Vulnerability Reporting に切り替えて議論を継続します。

## 対応プロセスとタイムライン

本プロジェクトは別に本業を持つメンテナーが業務外時間でメンテナンスしているため、以下は **ベストエフォートでの目安** とご理解ください（プロフェッショナルサポートではありません）。

| 段階 | 目安 |
|---|---|
| 受領確認の返信 | 7 日以内 |
| 脆弱性の評価と再現 | 30 日以内 |
| 修正版のリリース | 90 日以内（重大度・複雑度に依存） |
| 公開アドバイザリの発行 | 修正版リリース後 14 日以内 |

重大度の高い脆弱性（リモート任意コード実行・認証バイパス等）については、可能な限り上記より迅速な対応を試みます。具体的なスケジュールは報告者と個別に協議します。

長期休暇・繁忙期等で対応が遅れる場合があります。1 ヶ月以上応答がない場合は再度メールでリマインドしてください。

## 開示ポリシー

私たちは **責任ある開示（responsible disclosure）** を実践します。

1. 報告者と協力して脆弱性を確認・修正
2. 修正版をリリース
3. 修正版がリリースされ、ユーザーがアップデートする時間を確保した後、公開アドバイザリを発行
4. 報告者の貢献を（希望される場合は）クレジット表記

修正版リリース前の公開は避けてください。

## スコープ

以下の範囲はセキュリティ報告の対象です。

- `alpha-vis serve` の HTTP / API エンドポイント
- `backtest_results.db` 読み取り処理（SQL injection など）
- 戦略 JSON / `ideas.json` パーサー
- フロントエンド SPA（XSS など）
- ビルド・リリースパイプライン（GitHub Actions ワークフロー）

以下は **対象外** です。

- ユーザー自身のローカル環境設定の問題（`forge-dir` のパーミッション設定など）
- AlphaForge 本体の脆弱性 — そちらは AlphaForge のセキュリティポリシーに従って報告してください
- 既知のサードパーティ依存ライブラリの脆弱性で、未だ上流にパッチがないもの（先に上流に報告してください）

## 既知のセキュリティ考慮事項

- **`alpha-vis serve` はデフォルトで `127.0.0.1` のみで listen します**。`--host 0.0.0.0` を指定する場合は、外部ネットワークからのアクセス制御を必ず設定してください
- **認証機能はありません**。`alpha-vis serve` は信頼できるネットワーク内（ローカル開発・社内ネットワーク）での使用を想定しています
- **コマンド実行系エンドポイントがあります**。`POST /api/run`・`POST /api/jobs`・`POST /api/strategies/{id}/parameters` は PATH 上の `forge` CLI をサブプロセスとして実行します（引数はリスト形式・シェル非経由で、strategy_id / symbol は `--` 終端マーカーの後ろに positional として渡されます）。特に `POST /api/strategies/{id}/parameters` は**戦略定義を書き換えます**。非 localhost にバインドすると、到達可能な誰でもバックテスト・最適化の起動や戦略パラメータの変更ができるため、**公開バインドでの運用は推奨しません**。レスポンス・ログ中のホームディレクトリパスは `~` にマスクされます
- **`backtest_results.db` は SQLAlchemy 経由でパラメータ化クエリを使用** しており、API 層での SQL injection は想定されていません

ご協力ありがとうございます！🛡️
