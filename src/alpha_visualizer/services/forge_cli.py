"""forge CLI 呼び出しの共有ヘルパー。

``routers/run.py``（同期 1 発実行）と ``services/jobs.py``（非同期ジョブ基盤）の
両方から使う純粋関数・定数を集約する。プロセス起動そのものは呼び出し側の責務。
"""
from __future__ import annotations

import json
import os
import pathlib
import shutil
from typing import Any

from alpha_visualizer.forge_config import ForgeConfig

# forge 未導入ユーザーが実行系機能に触れた瞬間は AlphaForge 導入意欲が
# 最も高い接点なので、インストール先への導線を必ず含める。
FORGE_NOT_FOUND_MESSAGE = (
    "alpha-forge コマンドが見つかりません。AlphaForge を導入してください"
    " / alpha-forge command not found in PATH. Install AlphaForge"
    " — https://alforgelabs.com"
)

# forge は導入済みだがバージョンが古く、必要なサブコマンド（例: prune-orphans）を
# 持たないケース。生の Click エラー（"No such command 'xxx'."）をそのまま出すより
# 親切な導線に変換する。具体的なバージョン番号は書かない
# （次にどのリリースへ入るかは呼び出し側が知らないため）。
FORGE_SUBCOMMAND_NOT_FOUND_MESSAGE = (
    "お使いの alpha-forge にはこのコマンドがありません。新しいバージョンへ更新してください"
    " / Your alpha-forge does not have this command. Please update to a newer version"
    " — https://alforgelabs.com"
)


# forge は導入済みだが EULA に同意していないケース。forge は同意プロンプトを
# 対話で出すが、visualizer は stdin=DEVNULL で起動するため応答できず Click が
# Abort する（stderr は "Aborted!" のみで、利用者には何も伝わらない）。EULA は
# 改訂のたびに再同意が必要になるので、初回導入時だけの問題ではない。
FORGE_EULA_NOT_ACCEPTED_MESSAGE = (
    "AlphaForge の使用許諾契約（EULA）に同意していないため実行できません。"
    "ターミナルで `alpha-forge system doctor` を実行し、EULA に同意してください"
    " / AlphaForge EULA has not been accepted. Run `alpha-forge system doctor`"
    " in a terminal and accept the EULA"
)


# Pine 機能は有料プラン限定。forge は rich パネル（罫線付き）でアップグレード
# 案内を出すが、罫線ごと API の detail に載せると読めないため定型文に変換する。
# 既購入者が未認証のまま Trial 扱いで詰まるケースの復帰導線（auth login）も
# forge 本体のパネルと同じく必ず含める（forge issue #1164 と同趣旨）。
FORGE_PINE_PREMIUM_MESSAGE = (
    "Pine Script 出力は有料プラン（Lifetime / Annual / Monthly）限定です。"
    "アップグレード — https://alforgelabs.com/ja/index.html#pricing"
    "（購入済みの場合はターミナルで `alpha-forge system auth login` を実行して認証してください）"
    " / Pine Script export is available for paid plans only."
    " Upgrade — https://alforgelabs.com/en/index.html#pricing"
    " (already purchased? Run `alpha-forge system auth login` in a terminal)"
)


#: AlphaForge CLI の実行ファイル名。v0.5.0 で ``forge`` から改名され、インストーラ
#: （alforge-labs/install.sh）は旧 ``forge`` symlink を削除する。旧名へのフォール
#: バックは張らない — ``forge`` は Foundry（Solidity 開発ツール）のコマンド名でも
#: あり、無関係なバイナリへ backtest 引数を渡す事故のほうが重い。
FORGE_EXE_NAME = "alpha-forge"


def resolve_forge_exe() -> str | None:
    """PATH 上の alpha-forge 実行ファイルを解決する（無ければ None）。"""
    return shutil.which(FORGE_EXE_NAME)


def translate_forge_failure(stdout: str, stderr: str) -> str | None:
    """forge の失敗出力を、利用者が次の一歩を踏める案内へ変換する。

    該当パターンが無ければ ``None`` を返す。呼び出し側は生の出力にフォール
    バックすること（ここで既定文言に丸めると、原因不明の失敗がすべて同じ
    メッセージになり調査できなくなる）。

    stdout / stderr を両方受け取るのは、EULA プロンプトが rich パネルとして
    stdout に出る一方、Click の "Aborted!" は stderr に出るため。どちらか
    片方だけを見る実装では取りこぼす。
    """
    haystack = f"{stdout}\n{stderr}".lower()
    if "eula" in haystack:
        return FORGE_EULA_NOT_ACCEPTED_MESSAGE
    # Trial プランの Pine entitlement 拒否（issue #488）。判定は「pine」+
    # 「有料プラン / paid plans」の組み合わせ（FORGE_LANG により日英どちらの
    # パネルも出うるため両方見る）
    if "pine" in haystack and ("有料プラン" in f"{stdout}\n{stderr}" or "paid plans" in haystack):
        return FORGE_PINE_PREMIUM_MESSAGE
    if "no such command" in haystack:
        return FORGE_SUBCOMMAND_NOT_FOUND_MESSAGE
    return None


def build_forge_env(forge_cfg: ForgeConfig) -> dict[str, str]:
    """forge CLI サブプロセス用の環境変数を構築する。

    - ``FORGE_NONINTERACTIVE=1``: 破壊的操作の確認プロンプト（forge_confirm）を
      非対話化する。EULA 未同意時の Confirm.ask() はこれでは防げない（非対話
      同意は ``FORGE_ACCEPT_EULA`` のみ）ため、呼び出し側は必ず
      ``stdin=DEVNULL`` でハングせず即座に失敗させること。
    - ``FORGE_CONFIG``: ForgeConfig が解決した forge.yaml があればそれを明示する。
    """
    env = os.environ.copy()
    env["FORGE_NONINTERACTIVE"] = "1"
    # forge は EULA 未同意の案内を rich パネル（罫線＝非 ASCII）で出す。サーバーを
    # LANG / LC_ALL の無い環境（launchd・systemd・cron 等）で起動すると子プロセスの
    # stdout が ASCII になり、forge はパネルを書く時点で UnicodeEncodeError を起こして
    # `{"code": "execution_failed"}` を返す。こうなると translate_forge_failure は
    # EULA を検知できず、利用者には原因不明の失敗としか見えない。
    env["PYTHONIOENCODING"] = "utf-8"
    # 解決済みの forge.yaml を使う（<forge_dir>/forge.yaml 規約に限らず、
    # --forge-config 指定や FORGE_CONFIG 由来の別置き yaml もここに入る）。
    # 規約を再実装すると、別置き運用でサーバーと子プロセスの設定がずれる。
    if forge_cfg.config_path is not None:
        env["FORGE_CONFIG"] = str(forge_cfg.config_path)
    return env


def mask_home(text: str) -> str:
    """ホームディレクトリの絶対パスを ``~`` にマスクする。

    forge の出力にはデータ保存先などの絶対パスが含まれうる。非 localhost
    バインドで公開された場合にユーザー名等の実行環境情報が API レスポンス
    経由で漏れないようにする。
    """
    home = str(pathlib.Path.home())
    return text.replace(home, "~")


def parse_json_lenient(stdout: str) -> dict[str, Any] | None:
    """``--json`` の stdout を寛容にパースして dict を返す。

    stdout 全体が JSON でない場合も、警告行などが前後に混ざっただけの
    可能性があるため、最初の ``{`` から最後の ``}`` までの抽出を試す。
    dict にならなければ None。
    """
    candidates = [stdout]
    start = stdout.find("{")
    end = stdout.rfind("}")
    if 0 <= start < end:
        candidates.append(stdout[start : end + 1])
    for candidate in candidates:
        try:
            data = json.loads(candidate)
        except (json.JSONDecodeError, TypeError):
            continue
        if isinstance(data, dict):
            return data
    return None
