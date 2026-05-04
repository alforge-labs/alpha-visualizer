export const RANGES = ['1M', '3M', '6M', '1Y', '2Y', 'ALL'] as const
export type SelectedRange = (typeof RANGES)[number]

export const RANGE_N: Record<SelectedRange, number> = {
  '1M': 21, '3M': 63, '6M': 126, '1Y': 252, '2Y': 504, ALL: Number.POSITIVE_INFINITY,
}

/** noUncheckedIndexedAccess 環境で RANGE_N[r] を安全に取得するヘルパー */
export function getRangeN(r: SelectedRange): number {
  // SelectedRange は RANGE_N のキー全体をカバーするため必ず存在する
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return RANGE_N[r]!
}
