export type GoodWhen = 'pos' | 'dd' | 'gte1' | 'gte15' | 'wr' | null

// issue #350: DD 系（max_drawdown_pct）は API が正値 % 規約のため、
// 符号でなく絶対値で評価する。閾値はヘッダー KPI（MetricsSummaryBarV2）の
// 15 / 30 と共通（15 以下 = 良、30 超 = 悪、中間 = neutral）。
const DD_GOOD_MAX = 15
const DD_BAD_MIN = 30

export function evaluateGood(num: number | null, goodWhen: GoodWhen): boolean | null {
  if (num === null || goodWhen === null) return null
  switch (goodWhen) {
    case 'pos':
      return num > 0
    case 'dd': {
      const abs = Math.abs(num)
      if (abs <= DD_GOOD_MAX) return true
      if (abs > DD_BAD_MIN) return false
      return null
    }
    case 'gte1':
      return num >= 1
    case 'gte15':
      return num >= 1.5
    case 'wr':
      return num >= 50
    default:
      return null
  }
}
