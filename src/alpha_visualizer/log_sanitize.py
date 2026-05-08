"""ログ出力時のユーザー入力サニタイズユーティリティ。

CWE-117 (Log Injection / 改行による偽ログ行注入) 対策として、
ユーザー入力をログメッセージへ埋め込む直前に CR/LF を除去する。
"""
from __future__ import annotations


def sanitize_for_log(value: object) -> str:
    """ログに埋め込む前に CR/LF を空白へ置換した文字列を返す。

    None は ``"None"`` を返す。文字列以外は ``str()`` で変換してから処理する。
    改行を空白に置換するのは、トークン同士が結合してしまわないようにするため。
    """
    if value is None:
        return "None"
    text = str(value)
    return text.replace("\r", " ").replace("\n", " ")
