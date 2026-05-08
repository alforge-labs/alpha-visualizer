/**
 * ドローダウン期間の検出に関する純粋関数。
 *
 * 副作用なし。入力配列を mutate しない。
 */

export interface DrawdownPeriod {
  startIdx: number
  peakIdx: number
  endIdx: number
  /** ドローダウンの底値（負の値）。 */
  depth: number
  durationDays: number
  /** 回復までの日数。底値からの回復が観測されない場合は ``null``。 */
  recoveryDays: number | null
  startDate: string
  endDate: string
}

/** ドローダウン検出を「閾値以下」と見なす閾値（=1%）。 */
const DD_THRESHOLD = -0.01

/**
 * drawdown 配列（負の値で表現された下方乖離 %）を走査し、
 * 上位 ``top`` 件のドローダウン期間を depth 昇順（深い順）で返す。
 *
 * - ``dd[i] < -1%`` で期間開始、``dd[i] >= -1%`` または末尾で期間終了
 * - 底値 = 期間内の最小値（最も深いドローダウン）
 * - 回復は ``-1%`` 以上に戻った時点
 *
 * @param dd 各時点のドローダウン (decimal、負値)
 * @param dates 各時点の日付文字列。``dd`` と同じ長さ
 * @param top 返す件数の上限（既定 5）
 */
export function detectTopDrawdowns(
  dd: readonly number[],
  dates: readonly string[],
  top = 5,
): DrawdownPeriod[] {
  const periods: DrawdownPeriod[] = []
  let inDD = false
  let start = 0
  let minIdx = 0
  let minVal = 0

  for (let i = 0; i < dd.length; i++) {
    const v = dd[i] ?? 0
    if (!inDD && v < DD_THRESHOLD) {
      inDD = true
      start = i
      minIdx = i
      minVal = v
    } else if (inDD) {
      if (v < minVal) {
        minIdx = i
        minVal = v
      }
      if (v >= DD_THRESHOLD || i === dd.length - 1) {
        const recovery = v >= DD_THRESHOLD ? i - minIdx : null
        periods.push({
          startIdx: start,
          peakIdx: minIdx,
          endIdx: i,
          depth: minVal,
          durationDays: i - start,
          recoveryDays: recovery,
          startDate: dates[start] ?? '',
          endDate: dates[i] ?? '',
        })
        inDD = false
      }
    }
  }
  return periods.sort((a, b) => a.depth - b.depth).slice(0, top)
}
