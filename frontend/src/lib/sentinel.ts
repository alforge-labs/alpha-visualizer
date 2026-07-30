/**
 * forge は取引 0 件の run の sharpe_ratio / sortino_ratio にセンチネル値
 * -100 を書き込む（統計量が定義できない印）。UI はこれを実測値として
 * 表示せず「—（取引なしのため算出不可）」へ置き換える（issue #351）。
 */
export const NO_TRADE_SENTINEL = -100

/**
 * 値がセンチネルかを判定する。実測の Sharpe / Sortino が -100 に達する
 * ことは現実的にないため、しきい値（以下）で判定する。
 */
export function isNoTradeSentinel(value: number | null | undefined): boolean {
  return typeof value === 'number' && value <= NO_TRADE_SENTINEL
}
