"""forge が生成するディレクトリ構造からパスを解決するデータクラス"""

import pathlib
from dataclasses import dataclass


@dataclass(frozen=True)
class ForgeConfig:
    forge_dir: pathlib.Path

    @property
    def forge_db(self) -> pathlib.Path:
        return self.forge_dir / "data" / "results" / "forge.db"

    @property
    def strategies_dir(self) -> pathlib.Path:
        return self.forge_dir / "data" / "strategies"

    @property
    def ideas_json(self) -> pathlib.Path:
        return self.forge_dir / "data" / "ideas" / "ideas.json"
