/**
 * Live タブ用のフォーマット & diff 表示ヘルパー（純関数）
 *
 * UI は単純化のため backend が計算した diff 値を表示するが、
 * 「負→danger / 正→success / 0|null→muted」の判定はここで純粋に決める。
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

export function formatDiff(
  value: number | null | undefined,
  suffix = '',
): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  const abs = Math.abs(value)
  const fixed = abs >= 100 ? value.toFixed(1) : abs >= 10 ? value.toFixed(2) : value.toFixed(3)
  return `${sign}${fixed}${suffix}`
}

export function formatNumber(value: number | null | undefined, suffix = ''): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  const fixed = abs >= 100 ? value.toFixed(1) : abs >= 10 ? value.toFixed(2) : value.toFixed(3)
  return `${fixed}${suffix}`
}

export function formatInteger(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return String(Math.round(value))
}

export function toneColor(tone: DiffTone): string {
  if (tone === 'good') return 'var(--success)'
  if (tone === 'bad') return 'var(--danger)'
  return 'var(--text3)'
}
