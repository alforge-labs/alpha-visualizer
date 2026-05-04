---
name: "source-command-audit-licenses"
description: "サードパーティライセンスを監査し THIRDPARTY_LICENSES.txt を生成する"
---

# source-command-audit-licenses

Use this skill when the user asks to run the migrated source command `audit-licenses`.

## Command Template

# audit-licenses コマンド

Python 依存パッケージとフロントエンド（frontend/）の全サードパーティライセンスを監査し、
GPL/AGPL 混入がないことを確認した上で `THIRDPARTY_LICENSES.txt` をプロジェクトルートに生成する。
リリース前に必ず実行すること。

## 使い方

```
/audit-licenses
```

## 実行手順

### Step 1: Python側のライセンス監査

1. `pip-licenses` を仮想環境にインストールする。

   ```bash
   cd alpha-visualizer
   uv pip install pip-licenses
   ```

2. 全パッケージのライセンスを取得する。

   ```bash
   uv run pip-licenses --format=markdown --order=license
   ```

3. 出力を確認し、以下のいずれかが**ランタイム依存**として存在する場合は**直ちに中断**してユーザーに報告する。

   - ライセンス名に `GPL` または `AGPL` を含むパッケージ
   - ただし以下は**開発専用（dev）**のため除外して判定する:
     - `pytest`, `ruff`, `httpx`（devツール）
     - `pip-licenses`, `prettytable`（監査ツール）

4. LGPL はランタイム混入でも即中断ではなく、
   後述の THIRDPARTY_LICENSES.txt にLGPL告知を記載する形で続行する。

### Step 2: フロントエンド側のライセンス監査

1. visualizer ディレクトリで `license-checker` を実行する。

   ```bash
   cd alpha-visualizer/frontend
   npx license-checker --summary
   ```

2. GPL または AGPL を含むパッケージを発見した場合は**直ちに中断**してユーザーに報告する。
   （`frontend@0.0.0` の `UNLICENSED` はプロジェクト自身のため無視する）

### Step 3: THIRDPARTY_LICENSES.txt の生成

Step 1・Step 2 で問題がなければ以下を実行する。

1. Python ライセンス情報を JSON で取得する。

   ```bash
   cd alpha-visualizer
   uv run pip-licenses --format=json --with-license-file --no-license-path > /tmp/py-licenses.json
   ```

2. フロントエンドのライセンス情報を JSON で取得する。

   ```bash
   cd alpha-visualizer/frontend
   npx license-checker --json --out /tmp/fe-licenses.json
   ```

3. 以下の Python スクリプトを実行して `THIRDPARTY_LICENSES.txt` を生成する。

   ```python
   import json
   from datetime import date

   DEV_ONLY = {
       "alpha-visualizer",
       "pytest", "ruff", "httpx",
       "pip-licenses", "prettytable",
   }

   with open("/tmp/py-licenses.json") as f:
       py_data = json.load(f)
   with open("/tmp/fe-licenses.json") as f:
       fe_data = json.load(f)

   py_pkgs = [p for p in sorted(py_data, key=lambda x: x["Name"].lower())
              if p["Name"] not in DEV_ONLY]
   fe_pkgs = [(pkg, info) for pkg, info in sorted(fe_data.items())
              if not pkg.startswith("frontend@")]

   SEP = "=" * 80
   lines = [
       SEP, "THIRDPARTY_LICENSES.txt", SEP,
       f"Generated: {date.today().isoformat()}", "",
       "This product includes third-party software components listed below.",
       "These components are subject to their respective licenses.", "",
   ]

   lgpl_pkgs = [p for p in py_pkgs if "LGPL" in p["License"] or "lgpl" in p["License"].lower()]
   if lgpl_pkgs:
       lines += [
           "IMPORTANT LGPL NOTICE", "-" * 40,
           "This distribution includes the following LGPL-licensed libraries:",
       ]
       for p in lgpl_pkgs:
           lines.append(f"  - {p['Name']} ({p['License']})")
       lines += [
           "",
           "In compliance with LGPL-3.0, the source code of these libraries is",
           "available at their respective repositories listed in this file.",
           "Users may replace these libraries with modified versions by rebuilding",
           "from source. Contact us if you require object files for relinking.",
           "",
       ]

   lines += [SEP, "", "SECTION 1: PYTHON DEPENDENCIES", SEP,
             f"Total: {len(py_pkgs)} packages", ""]
   for p in py_pkgs:
       lines += [f"  {p['Name']} {p['Version']}", f"  License: {p['License']}"]
       text = p.get("LicenseText", "").strip()
       if text and text not in ("UNKNOWN", ""):
           lines.append("  License Text:")
           for line in text.splitlines()[:30]:
               lines.append(f"    {line}")
           if len(text.splitlines()) > 30:
               lines.append("    [... full text available at PyPI ...]")
       lines.append("")

   lines += [SEP, "", "SECTION 2: FRONTEND DEPENDENCIES (Vite + React)", SEP,
             f"Total: {len(fe_pkgs)} packages", ""]
   for pkg_ver, info in fe_pkgs:
       lines += [f"  {pkg_ver}", f"  License: {info.get('licenses', '')}"]
       repo = info.get("repository", "")
       if repo:
           lines.append(f"  Repository: {repo}")
       lines.append("")
   lines.append(SEP)

   output = "\n".join(lines)
   with open("THIRDPARTY_LICENSES.txt", "w") as f:
       f.write(output)
   print(f"Generated THIRDPARTY_LICENSES.txt ({len(output)} bytes, Python: {len(py_pkgs)}, Frontend: {len(fe_pkgs)})")
   ```

   ```bash
   cd alpha-visualizer
   uv run python -c "<上記スクリプト>"
   ```

4. 生成されたファイルの先頭を表示して内容を確認する。

   ```bash
   head -30 THIRDPARTY_LICENSES.txt
   ```

## 完了後の確認事項

- [ ] `THIRDPARTY_LICENSES.txt` がプロジェクトルートに生成されていること
- [ ] GPL/AGPL パッケージが**ランタイム依存**に含まれていないこと
- [ ] LGPL パッケージがある場合、ファイル先頭に LGPL 告知が記載されていること
- [ ] ファイルを `git add THIRDPARTY_LICENSES.txt` してリリースコミットに含めること

## 注意

- Python の仮想環境（`.venv`）が存在し `uv sync` 済みであることを前提とする。
- `pip-licenses` と `prettytable` はこのコマンド専用の監査ツールであり、`pyproject.toml` の
  依存には含めない（`uv pip install` で都度インストールする）。
- フロントエンドの `node_modules/` が存在しない場合は `npm install` を先に実行すること。
