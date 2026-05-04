# alpha-visualizer

AlphaForge バックテスト結果の Web 可視化ツール。

## インストール

```bash
uv pip install alpha-visualizer
```

## 使い方

```bash
# AlphaForge の DB があるディレクトリで起動
vis serve

# パスを明示する場合
vis serve --forge-dir /path/to/alpha-strategies

# ポート・ホストを指定
vis serve --port 9000 --host 0.0.0.0

# ブラウザを自動で開かない
vis serve --no-open
```

ブラウザで **http://127.0.0.1:8000** が開きます。`Ctrl+C` でサーバーを停止します。

## 開発環境

```bash
uv sync
uv run pytest tests/
uv run ruff check src/ tests/
```

## 関連

- [alpha-forge](https://github.com/ysakae/alpha-forge) — バックテストエンジン
