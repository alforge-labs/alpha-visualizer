"""forge の失敗出力を利用者向け案内へ変換する `translate_forge_failure` のテスト。

生の Click 出力（"Aborted!" / "No such command"）をそのまま画面に出すと、
利用者は次に何をすればよいか分からない。ここでは「どの失敗を、どの案内に
写像するか」という意図を検証する。
"""

from __future__ import annotations

from alpha_visualizer.services.forge_cli import (
    FORGE_EULA_NOT_ACCEPTED_MESSAGE,
    FORGE_SUBCOMMAND_NOT_FOUND_MESSAGE,
    translate_forge_failure,
)

# EULA プロンプトは rich パネルとして **stdout** に出る。stderr 側には Click の
# "Aborted!" しか載らないため、stderr だけを見る実装では検出できない。
_EULA_STDOUT = """╭────── AlphaForge エンドユーザー使用許諾契約 (EULA) — 初回起動時の確認 ───────╮
│ 本ソフトウェアの利用には EULA への同意が必要です。                           │
╰──────────────────────────────────────────────────────────────────────────────╯
EULA に同意しますか? [y/n] (n): """
_EULA_STDERR = "\nAborted!"


def test_EULA未同意を同意手順の案内に変換する() -> None:
    """`stdin=DEVNULL` で起動する以上、同意プロンプトには絶対に応答できない。

    利用者にとって "Aborted!" は何の情報も持たないので、ターミナルで同意する
    という次の一歩まで示す。EULA は改訂のたびに再同意が必要になるため、
    初回だけの問題ではない。
    """
    assert translate_forge_failure(_EULA_STDOUT, _EULA_STDERR) == (
        FORGE_EULA_NOT_ACCEPTED_MESSAGE
    )


def test_stderrにEULAが出る実装差にも追随する() -> None:
    """プロンプトの出力先が stdout / stderr のどちらでも検出する。

    出力先は forge 側の実装詳細であり、visualizer が依存してよい契約ではない。
    """
    assert translate_forge_failure("", "EULA に同意しますか? [y/n]") == (
        FORGE_EULA_NOT_ACCEPTED_MESSAGE
    )


def test_サブコマンド不在は更新案内に変換する() -> None:
    """既存の変換（forge が古い）も同じ入口に集約されていること。"""
    assert translate_forge_failure("", "Error: No such command 'prune-orphans'.") == (
        FORGE_SUBCOMMAND_NOT_FOUND_MESSAGE
    )


def test_該当しない失敗はNoneを返す() -> None:
    """変換できない失敗は握り潰さず、生の出力を呼び出し側に返させる。

    ここで既定メッセージに丸めると、原因の分からない失敗が全部同じ文言になり
    調査できなくなる。
    """
    assert translate_forge_failure("", "Traceback (most recent call last): ...") is None
