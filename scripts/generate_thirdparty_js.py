#!/usr/bin/env python3
"""THIRDPARTY_LICENSES.txt の SECTION 2（フロントエンド依存）を自動生成・検証する。

issue #187: SECTION 2 はこれまで `/audit-licenses` コマンドで半手動更新だったため、
`pnpm licenses list --json --prod` を情報源とする生成スクリプトに切り出し、
CI で drift（依存更新にファイルが追従していない状態）を検出できるようにする。

SECTION 1（Python 依存）はライセンス全文を含むためリリース時の `/audit-licenses`
で更新し、本スクリプトは既存ファイルの SECTION 1 を保持したまま SECTION 2 だけを
書き換える。

使い方:
    uv run python scripts/generate_thirdparty_js.py          # SECTION 2 を更新
    uv run python scripts/generate_thirdparty_js.py --check  # drift 検出（CI 用）

終了コード:
    0: 成功（--check 時は drift なし）
    1: --check で drift を検出
    2: GPL / AGPL ライセンスの prod 依存を検出（要人間判断）
"""

from __future__ import annotations

import argparse
import difflib
import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = REPO_ROOT / "frontend"
LICENSES_FILE = REPO_ROOT / "THIRDPARTY_LICENSES.txt"
SECTION2_HEADER = "SECTION 2: FRONTEND DEPENDENCIES (Vite + React)"
SEP = "=" * 80


def run_pnpm_licenses() -> dict[str, list[dict]]:
    """frontend で `pnpm licenses list --json --prod` を実行して JSON を返す。"""
    result = subprocess.run(
        ["pnpm", "licenses", "list", "--json", "--prod"],
        cwd=FRONTEND_DIR,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


def check_forbidden_licenses(data: dict[str, list[dict]]) -> list[str]:
    """GPL / AGPL 系ライセンスの prod 依存を返す（LGPL は告知運用のため除外）。"""
    forbidden: list[str] = []
    for license_name, pkgs in data.items():
        upper = license_name.upper()
        if "GPL" in upper and "LGPL" not in upper:
            forbidden.extend(f"{p['name']} ({license_name})" for p in pkgs)
    return forbidden


def build_section2(data: dict[str, list[dict]]) -> str:
    """SECTION 2 ブロック（先頭 SEP から末尾 SEP まで）を組み立てる。"""
    entries: list[tuple[str, str, str]] = []
    for license_name, pkgs in data.items():
        for p in pkgs:
            for version in p["versions"]:
                entries.append((f"{p['name']}@{version}", license_name, p.get("homepage") or ""))
    entries.sort(key=lambda e: e[0].lower())

    lines = [SEP, "", SECTION2_HEADER, SEP, f"Total: {len(entries)} packages", ""]
    for pkg_ver, license_name, homepage in entries:
        lines += [f"  {pkg_ver}", f"  License: {license_name}"]
        if homepage:
            lines.append(f"  Homepage: {homepage}")
        lines.append("")
    lines.append(SEP)
    return "\n".join(lines)


def replace_section2(current: str, section2: str) -> str:
    """既存ファイルの SECTION 2 ブロックを差し替える。"""
    header_idx = current.index(SECTION2_HEADER)
    # ヘッダの前にある SEP 行の先頭位置（ブロック開始）を探す
    block_start = current.rindex(SEP, 0, header_idx)
    return current[:block_start] + section2 + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="ファイルを書き換えず、SECTION 2 が最新かどうかだけ検証する（CI 用）",
    )
    args = parser.parse_args()

    data = run_pnpm_licenses()

    forbidden = check_forbidden_licenses(data)
    if forbidden:
        print("ERROR: GPL/AGPL licensed production dependencies detected:", file=sys.stderr)
        for item in forbidden:
            print(f"  - {item}", file=sys.stderr)
        return 2

    current = LICENSES_FILE.read_text(encoding="utf-8")
    if SECTION2_HEADER not in current:
        print(f"ERROR: '{SECTION2_HEADER}' not found in {LICENSES_FILE}", file=sys.stderr)
        return 2

    updated = replace_section2(current, build_section2(data))

    if args.check:
        if updated != current:
            print("THIRDPARTY_LICENSES.txt SECTION 2 is out of date.", file=sys.stderr)
            print("Run: uv run python scripts/generate_thirdparty_js.py", file=sys.stderr)
            diff = difflib.unified_diff(
                current.splitlines(),
                updated.splitlines(),
                fromfile="THIRDPARTY_LICENSES.txt (current)",
                tofile="THIRDPARTY_LICENSES.txt (expected)",
                lineterm="",
            )
            for i, line in enumerate(diff):
                if i >= 40:
                    print("  [... diff truncated ...]", file=sys.stderr)
                    break
                print(line, file=sys.stderr)
            return 1
        print("THIRDPARTY_LICENSES.txt SECTION 2 is up to date.")
        return 0

    LICENSES_FILE.write_text(updated, encoding="utf-8")
    total = sum(len(p["versions"]) for pkgs in data.values() for p in pkgs)
    print(f"Updated {LICENSES_FILE.name} SECTION 2 ({total} frontend prod packages)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
