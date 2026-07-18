/**
 * `backtest_results.source`（実行元 provenance・vis#299）の既知値。
 *
 * "strategy-file" は `backtest run --strategy-file`（一時定義 = 保存していない
 * パラメータでのチューニング試行など）で実行されたラン。バッジ判定を各
 * コンポーネントに直書きするとタイプミスで静かに表示が消えるため定数化する。
 */
export const RUN_SOURCE_STRATEGY_FILE = 'strategy-file' as const
