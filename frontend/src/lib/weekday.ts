/**
 * 日次リターンを曜日別に集計する純粋関数。
 */

export interface WeekdayStat {
  day: string
  avg: number
  count: number
  winRate: number
}

/**
 * 平日（月〜金）の曜日別平均リターン / 件数 / 勝率を集計する。
 *
 * - ``returns[i]`` は ``dates[i + 1]`` の終値リターン（前日比）として扱う
 *   （既存の chart 実装と同じ規約）
 * - ``labels`` の長さが結果配列の長さを決める（通常は 5 = 月〜金）
 * - ``new Date()`` でパース不可な日付はスキップ
 *
 * @param returns 日次リターン配列
 * @param dates ISO 日付文字列の配列。``returns.length + 1`` を想定
 * @param labels 表示用ラベル（例: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']）
 * @returns ``labels`` と同じ長さの集計
 */
export function computeWeekdayStats(
  returns: readonly number[],
  dates: readonly string[],
  labels: readonly string[],
): WeekdayStat[] {
  const stats = labels.map(() => ({ total: 0, count: 0, wins: 0 }))
  for (let i = 0; i < returns.length; i++) {
    const dateStr = dates[i + 1]
    if (!dateStr) continue
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) continue
    const idx = d.getDay() - 1 // 月=1 → 0, 火=2 → 1, ..., 金=5 → 4
    if (idx >= 0 && idx <= 4) {
      const stat = stats[idx]!
      const r = returns[i] ?? 0
      stat.total += r
      stat.count += 1
      if (r > 0) stat.wins += 1
    }
  }
  return labels.map((day, i) => {
    const stat = stats[i]!
    return {
      day,
      avg: stat.count > 0 ? stat.total / stat.count : 0,
      count: stat.count,
      winRate: stat.count > 0 ? (stat.wins / stat.count) * 100 : 0,
    }
  })
}
