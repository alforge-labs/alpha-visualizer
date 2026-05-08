"""FastAPI アプリの ``app.openapi()`` を JSON として書き出すユーティリティ。

フロント側 ``openapi-typescript`` への入力として利用する。サーバ起動不要で
fixture forge_dir 上に最小限のアプリを構築し ``frontend/openapi.json`` を生成する。

Usage::

    uv run python scripts/generate_openapi.py [出力先]

引数省略時は ``frontend/openapi.json``（プロジェクトルート相対）に書き出す。
出力後、書き出したパスを stdout に表示する。
"""
from __future__ import annotations

import json
import pathlib
import sys
from typing import Final

# プロジェクトルートを sys.path に通して alpha_visualizer をインポートする
ROOT: Final = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from alpha_visualizer.app import create_app  # noqa: E402

DEFAULT_OUTPUT: Final = ROOT / "frontend" / "openapi.json"
FIXTURE_FORGE_DIR: Final = ROOT / "frontend" / "e2e" / "fixtures" / "forge"


def main() -> int:
    output_path = (
        pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_OUTPUT
    )
    app = create_app(forge_dir=FIXTURE_FORGE_DIR)
    schema = app.openapi()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(schema, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"[ok] OpenAPI schema written: {output_path}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
