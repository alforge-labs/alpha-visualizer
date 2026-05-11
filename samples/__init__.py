"""alpha-visualizer 同梱サンプルデータ生成パッケージ。

`build_samples.py` がオーケストレーターで、`_generators/` 配下の各モジュールが
具体的な生成ロジックを担う。OSS 配布時にはこのパッケージ全体（および生成済みの
`sample-forge/` ディレクトリ）を wheel に同梱する。
"""
