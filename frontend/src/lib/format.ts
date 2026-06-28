/**
 * フォーマット関数の Single Source of Truth。
 *
 * 数値・割合・日付の表示は本ファイルの関数群に集約する。
 * 個別コンポーネント側で `toFixed` 等を直接呼ばないこと。
 */

export interface NumberFormatOptions {
  /**
   * 小数桁数。指定しない場合は auto（|v| >= 100 → 1、|v| >= 10 → 2、else → 3）。
   */
  decimals?: number
  /** 末尾に付ける文字（'%', 'x' など）。既定: '' */
  suffix?: string
  /** null / NaN / Infinity 時の表示。既定: '—' */
  fallback?: string
  /** true なら正の数で '+' を prefix。既定: false */
  sign?: boolean
}

/**
 * 数値を一貫した規約で文字列化する。
 *
 * - null / undefined / NaN / Infinity → fallback（既定 '—'）
 * - decimals 未指定時は値の規模に応じて自動（100以上→1, 10以上→2, それ以外→3）
 * - sign=true で正の数のみ '+' を前置
 */
export function fmtNumber(
  value: number | null | undefined,
  opts: NumberFormatOptions = {},
): string {
  const { decimals, suffix = '', fallback = '—', sign = false } = opts

  if (value == null || !Number.isFinite(value)) return fallback

  const abs = Math.abs(value)
  const dec = decimals ?? (abs >= 100 ? 1 : abs >= 10 ? 2 : 3)
  // issue #266: 桁区切りを SSoT 化。ja / en はともに ',' 区切り・'.' 小数点なので、
  // CI ロケール差で出力がブレないよう 'en-US' に固定する（両言語で表記は同一）。
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(value)
  const prefix = sign && value > 0 ? '+' : ''
  return `${prefix}${formatted}${suffix}`
}

/** Sharpe など 2 桁固定の指標向けショートカット。 */
export function fmtSharpe(value: number | null | undefined): string {
  return fmtNumber(value, { decimals: 2 })
}

/** % suffix を付与した fmtNumber。 */
export function fmtPercent(
  value: number | null | undefined,
  opts: Omit<NumberFormatOptions, 'suffix'> = {},
): string {
  return fmtNumber(value, { ...opts, suffix: '%' })
}

/** 整数化（四捨五入）。null / NaN / Infinity は fallback。 */
export function fmtInteger(
  value: number | null | undefined,
  fallback = '—',
): string {
  if (value == null || !Number.isFinite(value)) return fallback
  return String(Math.round(value))
}

/** diff 表示用。正の数で '+' を強制前置する fmtNumber ショートカット。 */
export function fmtDiff(
  value: number | null | undefined,
  suffix = '',
): string {
  return fmtNumber(value, { sign: true, suffix })
}

/**
 * ISO 日時文字列から日付部分（YYYY-MM-DD）だけを取り出す。
 * 'T' を含まない値はそのまま返す。
 */
export function fmtDate(value: string | null | undefined, fallback = '—'): string {
  if (!value) return fallback
  const idx = value.indexOf('T')
  return idx > 0 ? value.slice(0, idx) : value
}
