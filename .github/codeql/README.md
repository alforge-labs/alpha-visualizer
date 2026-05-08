# CodeQL 設定

このディレクトリは GitHub Actions の CodeQL ワークフロー
（`.github/workflows/codeql.yml`）から参照される設定を管理する。

## ファイル構成

- **`codeql-config.yml`** — メイン設定。クエリスイート・除外パス。
- **`README.md`** — 本ファイル。

## 採用しているクエリスイート

| Suite | 役割 |
|---|---|
| `security-and-quality` | 既定。コード品質 + セキュリティの幅広いチェック |
| `security-extended` | 高精度のセキュリティ強化クエリ（SQL injection / SSRF / path traversal / XSS 等） |

両方を `uses:` で並べることで、Quality 警告と高精度 Security 警告を併発する。

## 除外パス

`paths-ignore:` セクションで以下を除外:

- `src/alpha_visualizer/static/**` — Vite ビルド成果物（vendor 化された JS）
- `frontend/src/api/types.gen.ts` — `openapi-typescript` 自動生成
- `frontend/openapi.json` — FastAPI 自動生成スキーマ
- `frontend/e2e/fixtures/**` / `tests/fixtures/**` — テストフィクスチャ

## カスタム `.ql` クエリの追加方法（将来）

プロジェクト固有のパターン（例: `text("SELECT ..." + user_input)` 形式の生 SQL
注入、forge.db のパス注入など）をカスタムクエリで検出したい場合:

1. `.github/codeql/queries/` ディレクトリを作成
2. `qlpack.yml` を作成（言語と依存パックを宣言）
3. `MyCheck.ql` 等のクエリファイルを追加（CodeQL の QL 言語）
4. `codeql-config.yml` の `queries:` に
   `- uses: ./.github/codeql/queries` を追加

> 参考: <https://docs.github.com/code-security/codeql-cli/getting-started-with-the-codeql-cli/customizing-analysis-with-codeql-packs>

## ローカル動作確認

CodeQL CLI が手元にあれば以下で簡易検証可能:

```sh
codeql database create build/codeql-db \
  --language=python --source-root=src
codeql database analyze build/codeql-db \
  codeql/python-queries:codeql-suites/security-and-quality.qls \
  codeql/python-queries:codeql-suites/security-extended.qls \
  --format=sarif-latest --output=build/codeql.sarif
```

CI では `github/codeql-action/init@v3` がこれを自動化する。
