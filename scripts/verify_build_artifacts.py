"""ビルド成果物（wheel / sdist）に frontend の static/ が同梱されているか検証する。

issue #225: v0.7.1 の公開 wheel に Vite ビルド成果物（alpha_visualizer/static/）が
同梱されず、SPA ダッシュボードが一切表示できない packaging 事故が起きた。
static/ は .gitignore 管理のため hatchling の既定挙動（VCS ignore 尊重）で除外され、
release.yml が wheel build 直前に `pnpm run build` を実行していても wheel には
入らなかった。本スクリプトはその再発を CI / リリースフローで検出する。

使い方:
    uv run python scripts/verify_build_artifacts.py dist/

検証内容:
- dist/ 内の wheel に `alpha_visualizer/static/index.html` と JS アセットが存在する
- dist/ 内の sdist に `src/alpha_visualizer/static/index.html` が存在する
- 併せて同梱サンプル（alpha_visualizer/samples/sample-forge/）の欠落も検出する
"""

from __future__ import annotations

import pathlib
import sys
import tarfile
import zipfile

# index.html + ハッシュ付き JS/CSS バンドルで最低でもこの数は入るはず。
# 閾値を 1（index.html のみ）にすると「index はあるがアセット欠落」を見逃すため余裕を持たせる。
MIN_STATIC_ENTRIES = 3


def _fail(message: str) -> None:
    print(f"::error::{message}")
    sys.exit(1)


def verify_wheel(wheel_path: pathlib.Path) -> None:
    with zipfile.ZipFile(wheel_path) as zf:
        names = zf.namelist()

    static_entries = [n for n in names if n.startswith("alpha_visualizer/static/")]
    if "alpha_visualizer/static/index.html" not in names:
        _fail(
            f"{wheel_path.name}: alpha_visualizer/static/index.html が含まれていません"
            "（frontend ビルド成果物の同梱漏れ。issue #225 の再発）"
        )
    if len(static_entries) < MIN_STATIC_ENTRIES:
        _fail(
            f"{wheel_path.name}: static/ エントリが {len(static_entries)} 件しかありません"
            f"（最低 {MIN_STATIC_ENTRIES} 件必要。JS/CSS アセットの欠落疑い）"
        )
    if not any(n.startswith("alpha_visualizer/samples/sample-forge/") for n in names):
        _fail(f"{wheel_path.name}: 同梱サンプル sample-forge/ が含まれていません")
    print(f"OK: {wheel_path.name} (static {len(static_entries)} entries)")


def verify_sdist(sdist_path: pathlib.Path) -> None:
    with tarfile.open(sdist_path) as tf:
        names = tf.getnames()

    # sdist は `alpha_visualizer-X.Y.Z/` プレフィックス付き
    static_entries = [n for n in names if "/src/alpha_visualizer/static/" in n]
    if not any(n.endswith("src/alpha_visualizer/static/index.html") for n in names):
        _fail(
            f"{sdist_path.name}: src/alpha_visualizer/static/index.html が含まれていません"
            "（sdist からの pip install で SPA が欠落する。issue #225）"
        )
    if len(static_entries) < MIN_STATIC_ENTRIES:
        _fail(
            f"{sdist_path.name}: static/ エントリが {len(static_entries)} 件しかありません"
            f"（最低 {MIN_STATIC_ENTRIES} 件必要）"
        )
    print(f"OK: {sdist_path.name} (static {len(static_entries)} entries)")


def main() -> None:
    if len(sys.argv) != 2:
        _fail("使い方: verify_build_artifacts.py <dist ディレクトリ>")
    dist_dir = pathlib.Path(sys.argv[1])

    wheels = sorted(dist_dir.glob("*.whl"))
    sdists = sorted(dist_dir.glob("*.tar.gz"))
    if not wheels:
        _fail(f"{dist_dir}: wheel (*.whl) が見つかりません")
    if not sdists:
        _fail(f"{dist_dir}: sdist (*.tar.gz) が見つかりません")

    for wheel in wheels:
        verify_wheel(wheel)
    for sdist in sdists:
        verify_sdist(sdist)


if __name__ == "__main__":
    main()
