export type GoodWhen = 'pos' | 'neg' | 'gte1' | 'gte15' | 'wr' | null

export function evaluateGood(num: number | null, goodWhen: GoodWhen): boolean | null {
  if (num === null || goodWhen === null) return null
  switch (goodWhen) {
    case 'pos':
      return num > 0
    case 'neg':
      return num < 0
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
