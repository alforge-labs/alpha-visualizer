import type { Lang } from '../i18n/strings'
import { L } from '../i18n/strings'
import type { ChartTheme } from '../design/useChartTheme'
import { fmtPercent, fmtSharpe } from './format'

/**
 * 共有カード（C5 バイラルループ）。
 *
 * バックテスト結果を OGP サイズ（1200×630）の PNG に合成してダウンロードする。
 * カード下部のブランド行が SNS 上での AlphaForge 認知経路になるため、
 * ブランド行は言語によらず固定の 1 定数（SHARE_CARD_BRAND）とする。
 */

export const SHARE_CARD_BRAND = 'Backtested with AlphaForge — alforgelabs.com'

export const SHARE_CARD_WIDTH = 1200
export const SHARE_CARD_HEIGHT = 630

/** 折れ線に使う最大頂点数。これを超える equity は等間隔に間引く。 */
const MAX_CHART_POINTS = 400

export type MetricTone = 'success' | 'danger' | 'neutral'

export interface ShareCardMetric {
  label: string
  value: string
  tone: MetricTone
}

export interface ShareCardData {
  title: string
  subtitle: string
  metrics: ShareCardMetric[]
  brand: string
}

/** buildShareCardData が必要とする最小限の BacktestDetail 部分集合。 */
export interface ShareCardInput {
  strategy_id: string
  symbol: string
  timeframe: string
  period: { start: string; end: string }
  metrics: {
    total_return_pct: number
    cagr_pct: number
    sharpe_ratio: number
    max_drawdown_pct: number
    win_rate_pct: number
  }
  equity: { dates: string[]; values: number[] }
}

function returnTone(pct: number): MetricTone {
  if (pct > 0) return 'success'
  if (pct < 0) return 'danger'
  return 'neutral'
}

export function buildShareCardData(input: ShareCardInput, lang: Lang): ShareCardData {
  const m = input.metrics
  return {
    title: input.strategy_id,
    subtitle: `${input.symbol} · ${input.timeframe} · ${input.period.start} → ${input.period.end}`,
    metrics: [
      {
        label: L(lang, 'リターン', 'Return'),
        value: fmtPercent(m.total_return_pct, { decimals: 2, sign: true }),
        tone: returnTone(m.total_return_pct),
      },
      {
        label: 'CAGR',
        value: fmtPercent(m.cagr_pct, { decimals: 2 }),
        tone: 'neutral',
      },
      {
        label: L(lang, 'シャープ', 'Sharpe'),
        value: fmtSharpe(m.sharpe_ratio),
        tone: 'neutral',
      },
      {
        label: L(lang, '最大DD', 'Max DD'),
        value: fmtPercent(m.max_drawdown_pct, { decimals: 2 }),
        tone: 'danger',
      },
      {
        label: L(lang, '勝率', 'Win rate'),
        value: fmtPercent(m.win_rate_pct, { decimals: 1 }),
        tone: 'neutral',
      },
    ],
    brand: SHARE_CARD_BRAND,
  }
}

export interface ChartPoint {
  x: number
  y: number
}

/**
 * equity 値列を width×height のボックス座標に正規化する。
 * y は canvas 座標系（上が 0）なので、最大値が y=0・最小値が y=height。
 * フラットな系列は中央の水平線とする。2 点未満は描画対象なし（[]）。
 */
export function normalizeEquity(
  values: number[],
  width: number,
  height: number,
): ChartPoint[] {
  // NaN/Infinity は 1 点でも混入すると Math.min/max を NaN 化して
  // 全点の座標を壊すため、座標化の前に除外する（Fail Loud より
  // 「有効な点だけで描く」を選ぶ: カードは他の指標だけでも成立する）。
  const finite: Array<{ v: number; i: number }> = []
  values.forEach((v, i) => {
    if (Number.isFinite(v)) finite.push({ v, i })
  })
  if (finite.length < 2) return []

  let sampled: Array<{ v: number; i: number }>
  if (finite.length <= MAX_CHART_POINTS) {
    sampled = finite
  } else {
    sampled = []
    for (let k = 0; k < MAX_CHART_POINTS; k++) {
      const j = Math.round((k * (finite.length - 1)) / (MAX_CHART_POINTS - 1))
      const p = finite[j]
      if (p !== undefined) sampled.push(p)
    }
  }

  const min = Math.min(...sampled.map((p) => p.v))
  const max = Math.max(...sampled.map((p) => p.v))
  const span = max - min
  const lastIndex = values.length - 1

  return sampled.map(({ v, i }) => ({
    x: (i / lastIndex) * width,
    y: span === 0 ? height / 2 : ((max - v) / span) * height,
  }))
}

/**
 * measure（幅計測関数）で maxWidth に収まるまで末尾を削り「…」を付ける。
 * canvas の ctx.measureText を注入して使う（テストでは擬似メジャーを注入）。
 */
export function truncateToWidth(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
): string {
  if (measure(text) <= maxWidth) return text
  let t = text
  while (t.length > 0 && measure(`${t}…`) > maxWidth) t = t.slice(0, -1)
  return `${t}…`
}

/** strategy_id / symbol からパス安全なファイル名を組み立てる。 */
export function shareCardFilename(strategyId: string, symbol: string): string {
  const safe = (s: string): string => s.replace(/[^A-Za-z0-9._-]/g, '_')
  return `alphaforge_${safe(strategyId)}_${safe(symbol)}.png`
}

/* ---- 以下は canvas 描画（jsdom では 2D コンテキスト非対応のため単体テスト対象外） ---- */

const PAD = 64
const CHART_TOP = 220
const CHART_HEIGHT = 210
const METRICS_TOP = 486

function drawChart(
  ctx: CanvasRenderingContext2D,
  points: ChartPoint[],
  theme: ChartTheme,
): void {
  const first = points[0]
  const last = points[points.length - 1]
  if (points.length < 2 || first === undefined || last === undefined) return
  const ox = PAD
  const oy = CHART_TOP

  const path = new Path2D()
  points.forEach((p, i) => {
    if (i === 0) path.moveTo(ox + p.x, oy + p.y)
    else path.lineTo(ox + p.x, oy + p.y)
  })

  const fill = new Path2D(path)
  fill.lineTo(ox + last.x, oy + CHART_HEIGHT)
  fill.lineTo(ox + first.x, oy + CHART_HEIGHT)
  fill.closePath()
  const grad = ctx.createLinearGradient(0, oy, 0, oy + CHART_HEIGHT)
  grad.addColorStop(0, theme.accentBg)
  grad.addColorStop(1, theme.bg)
  ctx.fillStyle = grad
  ctx.fill(fill)

  ctx.strokeStyle = theme.accent
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.stroke(path)
}

export function drawShareCard(
  ctx: CanvasRenderingContext2D,
  data: ShareCardData,
  points: ChartPoint[],
  theme: ChartTheme,
): void {
  const w = SHARE_CARD_WIDTH
  const h = SHARE_CARD_HEIGHT

  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = theme.border
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, w - 2, h - 2)

  const maxTextWidth = w - PAD * 2
  const measure = (s: string): number => ctx.measureText(s).width

  ctx.fillStyle = theme.text
  ctx.font = `600 52px ${theme.serif}`
  ctx.fillText(truncateToWidth(data.title, maxTextWidth, measure), PAD, 118)

  ctx.fillStyle = theme.text2
  ctx.font = `24px ${theme.mono}`
  ctx.fillText(truncateToWidth(data.subtitle, maxTextWidth, measure), PAD, 166)

  drawChart(ctx, points, theme)

  const toneColor: Record<MetricTone, string> = {
    success: theme.success,
    danger: theme.danger,
    neutral: theme.text,
  }
  const colWidth = (w - PAD * 2) / data.metrics.length
  data.metrics.forEach((m, i) => {
    const x = PAD + i * colWidth
    ctx.fillStyle = theme.text3
    ctx.font = `18px ${theme.mono}`
    ctx.fillText(m.label.toUpperCase(), x, METRICS_TOP)
    ctx.fillStyle = toneColor[m.tone]
    ctx.font = `600 36px ${theme.mono}`
    ctx.fillText(m.value, x, METRICS_TOP + 44)
  })

  ctx.strokeStyle = theme.border
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD, h - 62)
  ctx.lineTo(w - PAD, h - 62)
  ctx.stroke()
  ctx.fillStyle = theme.text2
  ctx.font = `20px ${theme.mono}`
  ctx.fillText(data.brand, PAD, h - 26)
}

/**
 * 共有カード PNG を生成してダウンロードする。
 * 2D コンテキストが取得できない環境では Fail Loud（黙って何もしない、を避ける）。
 */
export function downloadShareCard(
  input: ShareCardInput,
  lang: Lang,
  theme: ChartTheme,
): void {
  const dpr = 2 // OGP 用途は固定サイズなので端末非依存の 2x で書き出す
  const canvas = document.createElement('canvas')
  canvas.width = SHARE_CARD_WIDTH * dpr
  canvas.height = SHARE_CARD_HEIGHT * dpr
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is unavailable')
  ctx.scale(dpr, dpr)

  const data = buildShareCardData(input, lang)
  const points = normalizeEquity(
    input.equity.values,
    SHARE_CARD_WIDTH - PAD * 2,
    CHART_HEIGHT,
  )
  drawShareCard(ctx, data, points, theme)

  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = shareCardFilename(input.strategy_id, input.symbol)
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}
