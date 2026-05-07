"""IdeasReader のユニットテスト"""
from __future__ import annotations

from pathlib import Path

from alpha_visualizer.repositories.ideas import IdeasReader


def test_read_returns_empty_when_file_missing(tmp_path: Path) -> None:
    """ideas.json が存在しない場合は空リストを返す"""
    reader = IdeasReader(tmp_path / "ideas.json")

    assert reader.read() == []


def test_read_returns_list_form(tmp_path: Path) -> None:
    """ideas.json がリスト形式の場合は dict 要素のみのリストを返す"""
    path = tmp_path / "ideas.json"
    path.write_text(
        '[{"idea_id": "idea_001", "title": "テスト", "status": "pending"}, '
        '"not_a_dict", '
        '{"idea_id": "idea_002", "title": "別案", "status": "done"}]',
        encoding="utf-8",
    )
    reader = IdeasReader(path)

    ideas = reader.read()

    assert len(ideas) == 2
    assert ideas[0]["idea_id"] == "idea_001"
    assert ideas[1]["idea_id"] == "idea_002"


def test_read_returns_inner_list_when_dict_form(tmp_path: Path) -> None:
    """`{"ideas": [...]}` 形式でも内側のリストを抽出する"""
    path = tmp_path / "ideas.json"
    path.write_text(
        '{"ideas": [{"idea_id": "idea_010", "title": "ラップ済み"}], '
        '"meta": "ignored"}',
        encoding="utf-8",
    )
    reader = IdeasReader(path)

    ideas = reader.read()

    assert len(ideas) == 1
    assert ideas[0]["idea_id"] == "idea_010"


def test_read_returns_empty_on_invalid_json(tmp_path: Path) -> None:
    """JSON として不正な内容の場合は空リストを返す"""
    path = tmp_path / "ideas.json"
    path.write_text("{ this is not valid json", encoding="utf-8")
    reader = IdeasReader(path)

    assert reader.read() == []
