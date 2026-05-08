/**
 * Live タブ用の diff トーン判定ヘルパー（純関数）。
 *
 * 数値や差分の表示は `lib/format.ts` の `fmtNumber` / `fmtDiff` / `fmtInteger` に集約済み。
 * ここには「どのトーンで表示するか」のドメインロジックだけを残す。
 */

export type DiffTone = 'good' | 'bad' | 'neutral'

/**
 * メトリック種別ごとに「良い方向」を考慮して diff の色トーンを決める。
 * - max_drawdown_pct のみ「値が大きい（= 0 に近い）方が良い」が、
 *   diff = live - backtest は live の方が値が大きい（= DD 小さい）= 良い、なので
 *   その他のメトリックと同じく「正→good / 負→bad」で扱える。
 */
export function diffTone(value: number | null | undefined): DiffTone {
  if (value == null || !Number.isFinite(value) || value === 0) return 'neutral'
  return value > 0 ? 'good' : 'bad'
}

export function toneColor(tone: DiffTone): string {
  if (tone === 'good') return 'var(--success)'
  if (tone === 'bad') return 'var(--danger)'
  return 'var(--text3)'
}
