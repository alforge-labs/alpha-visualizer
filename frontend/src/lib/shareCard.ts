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

/**
 * 値列を先頭の有限・非ゼロ値を基準とした変化率（%）に変換する。
 * 比較カードは初期資金が戦略ごとに異なりうるため、共通スケールに
 * 乗せる前に必ず変化率へ正規化する。基準が見つからなければ []。
 * 非有限値は NaN のまま残し、座標化（normalizeMultiSeries）側で落とす。
 */
export function rebaseToPct(values: number[]): number[] {
  const base = values.find((v) => Number.isFinite(v) && v !== 0)
  if (base === undefined) return []
  return values.map((v) => (Number.isFinite(v) ? (v / base - 1) * 100 : NaN))
}

/** 日付付きの1系列（Compare カードの入力単位）。 */
export interface ShareCardTimeSeries {
  dates: string[]
  values: number[]
}

/**
 * 複数系列を「共通の日付ドメイン × 共通の値 min/max」で width×height の
 * ボックス座標へ正規化する。Y だけでなく X も共通スケールであることが本質:
 * 期間の異なるバックテスト同士を各系列個別に横幅いっぱいへ引き伸ばすと、
 * 期間の長さの違いが消えて比較が嘘になる（画面側 CompareEquityV の
 * scaleTime による共通 xDomain と同じ規約）。
 * 有効点（値が有限かつ日付がパース可能）が 2 点未満の系列は []。
 */
export function normalizeMultiSeries(
  seriesInputs: ShareCardTimeSeries[],
  width: number,
  height: number,
): ChartPoint[][] {
  const parsed = seriesInputs.map((s) => {
    const pts: Array<{ v: number; t: number }> = []
    s.values.forEach((v, i) => {
      const t = Date.parse(s.dates[i] ?? '')
      if (Number.isFinite(v) && Number.isFinite(t)) pts.push({ v, t })
    })
    return pts.length >= 2 ? pts : []
  })

  const all = parsed.flat()
  if (all.length === 0) return seriesInputs.map(() => [])

  const tMin = Math.min(...all.map((p) => p.t))
  const tMax = Math.max(...all.map((p) => p.t))
  const tSpan = tMax - tMin
  const vMin = Math.min(...all.map((p) => p.v))
  const vMax = Math.max(...all.map((p) => p.v))
  const vSpan = vMax - vMin

  return parsed.map((pts) =>
    pts.map((p) => ({
      x: tSpan === 0 ? width / 2 : ((p.t - tMin) / tSpan) * width,
      y: vSpan === 0 ? height / 2 : ((vMax - p.v) / vSpan) * height,
    })),
  )
}

/** Compare カードの入力（StrategyComparison の構造的部分集合）。 */
export interface CompareShareInput {
  name: string
  total_return_pct?: number | null
  equity?: { dates: string[]; values: number[] } | null
}

/** 比較カードのタイル数上限（横幅とラベル可読性の兼ね合い）。 */
const MAX_COMPARE_TILES = 5

export function buildCompareShareCardData(
  strategies: ReadonlyArray<Pick<CompareShareInput, 'name' | 'total_return_pct'>>,
  symbol: string,
  lang: Lang,
): ShareCardData {
  return {
    title: L(lang, '戦略比較', 'Strategy Comparison'),
    subtitle: `${symbol} · ${strategies.length} ${L(lang, '戦略', 'strategies')}`,
    metrics: strategies.slice(0, MAX_COMPARE_TILES).map((s) => ({
      label: s.name,
      value: fmtPercent(s.total_return_pct, { decimals: 2, sign: true }),
      tone: returnTone(s.total_return_pct ?? 0),
    })),
    brand: SHARE_CARD_BRAND,
  }
}

/** Live カードの入力（LiveSummary の構造的部分集合）。 */
export interface LiveShareInput {
  strategy_id: string
  updated_at?: string | null
  metrics?: {
    total_return_pct?: number | null
    cagr_pct?: number | null
    sharpe_ratio?: number | null
    max_drawdown_pct?: number | null
  } | null
  equity?: [string, number][] | null
}

export function buildLiveShareCardData(
  input: Pick<LiveShareInput, 'strategy_id' | 'updated_at' | 'metrics'>,
  lang: Lang,
): ShareCardData {
  const m = input.metrics ?? {}
  const date = input.updated_at ? input.updated_at.slice(0, 10) : null
  const base = L(lang, 'ペーパートレード実績（ライブ）', 'Paper trading live record')
  return {
    title: input.strategy_id,
    subtitle: date ? `${base} · ${date}` : base,
    metrics: [
      {
        label: L(lang, 'リターン', 'Return'),
        value: fmtPercent(m.total_return_pct, { decimals: 2, sign: true }),
        tone: returnTone(m.total_return_pct ?? 0),
      },
      { label: 'CAGR', value: fmtPercent(m.cagr_pct, { decimals: 2 }), tone: 'neutral' },
      { label: L(lang, 'シャープ', 'Sharpe'), value: fmtSharpe(m.sharpe_ratio), tone: 'neutral' },
      { label: L(lang, '最大DD', 'Max DD'), value: fmtPercent(m.max_drawdown_pct, { decimals: 2 }), tone: 'danger' },
    ],
    brand: SHARE_CARD_BRAND,
  }
}

/* ---- 以下は canvas 描画（jsdom では 2D コンテキスト非対応のため単体テスト対象外） ---- */

const PAD = 64
const CHART_TOP = 220
const CHART_HEIGHT = 210
const METRICS_TOP = 486

/** カードに描く1系列（色・凡例ラベル付き）。 */
export interface ShareCardSeries {
  points: ChartPoint[]
  color: string
  label?: string
}

function drawChart(
  ctx: CanvasRenderingContext2D,
  series: ShareCardSeries[],
  theme: ChartTheme,
): void {
  const drawable = series.filter((s) => s.points.length >= 2)
  const ox = PAD
  const oy = CHART_TOP

  drawable.forEach((s) => {
    const first = s.points[0]
    const last = s.points[s.points.length - 1]
    if (first === undefined || last === undefined) return

    const path = new Path2D()
    s.points.forEach((p, i) => {
      if (i === 0) path.moveTo(ox + p.x, oy + p.y)
      else path.lineTo(ox + p.x, oy + p.y)
    })

    // グラデーション塗りは単一系列のみ（複数系列では重なって濁る）
    if (drawable.length === 1) {
      const fill = new Path2D(path)
      fill.lineTo(ox + last.x, oy + CHART_HEIGHT)
      fill.lineTo(ox + first.x, oy + CHART_HEIGHT)
      fill.closePath()
      const grad = ctx.createLinearGradient(0, oy, 0, oy + CHART_HEIGHT)
      grad.addColorStop(0, theme.accentBg)
      grad.addColorStop(1, theme.bg)
      ctx.fillStyle = grad
      ctx.fill(fill)
    }

    ctx.strokeStyle = s.color
    ctx.lineWidth = drawable.length === 1 ? 3 : 2.5
    ctx.lineJoin = 'round'
    ctx.stroke(path)
  })
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  series: ShareCardSeries[],
  theme: ChartTheme,
): void {
  const labeled = series.filter((s) => s.label)
  if (labeled.length < 2) return
  let x = PAD
  const y = CHART_TOP - 22
  ctx.font = `18px ${theme.mono}`
  for (const s of labeled) {
    const label = s.label ?? ''
    const w = ctx.measureText(label).width
    if (x + 22 + w > SHARE_CARD_WIDTH - PAD) break
    ctx.fillStyle = s.color
    ctx.fillRect(x, y - 7, 14, 4)
    ctx.fillStyle = theme.text2
    ctx.fillText(label, x + 22, y)
    x += 22 + w + 28
  }
}

export function drawShareCard(
  ctx: CanvasRenderingContext2D,
  data: ShareCardData,
  series: ShareCardSeries[],
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

  drawLegend(ctx, series, theme)
  drawChart(ctx, series, theme)

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

/** カードのチャート描画領域（座標化に使う共通ボックス）。 */
const CHART_BOX_WIDTH = SHARE_CARD_WIDTH - PAD * 2

/**
 * 任意のカードデータ＋系列を PNG としてダウンロードする共通経路。
 * 2D コンテキストが取得できない環境では Fail Loud（黙って何もしない、を避ける）。
 */
export function downloadCardPng(
  data: ShareCardData,
  series: ShareCardSeries[],
  filename: string,
  theme: ChartTheme,
): void {
  const dpr = 2 // OGP 用途は固定サイズなので端末非依存の 2x で書き出す
  const canvas = document.createElement('canvas')
  canvas.width = SHARE_CARD_WIDTH * dpr
  canvas.height = SHARE_CARD_HEIGHT * dpr
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is unavailable')
  ctx.scale(dpr, dpr)

  drawShareCard(ctx, data, series, theme)

  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

/** Detail 画面のバックテスト結果カード（単一系列＋5指標）。 */
export function downloadShareCard(
  input: ShareCardInput,
  lang: Lang,
  theme: ChartTheme,
): void {
  const data = buildShareCardData(input, lang)
  const points = normalizeEquity(input.equity.values, CHART_BOX_WIDTH, CHART_HEIGHT)
  downloadCardPng(
    data,
    [{ points, color: theme.accent }],
    shareCardFilename(input.strategy_id, input.symbol),
    theme,
  )
}

/** Compare 画面の複数戦略比較カード（共通日付ドメイン・変化率ベース）。 */
export function downloadCompareShareCard(
  strategies: ReadonlyArray<CompareShareInput>,
  symbol: string,
  lang: Lang,
  theme: ChartTheme,
): void {
  // フィルタ条件は画面側（CompareScreen の `filter(s => s.equity)`）と同一に
  // して系列色のインデックスずれを防ぐ。描画系列もタイルと同じ上限で切り、
  // 5色パレットの色衝突・凡例欠落を避ける
  const withEquity = strategies
    .filter((s) => s.equity != null)
    .slice(0, MAX_COMPARE_TILES)
  const pointsPerSeries = normalizeMultiSeries(
    withEquity.map((s) => ({
      dates: s.equity?.dates ?? [],
      values: rebaseToPct(s.equity?.values ?? []),
    })),
    CHART_BOX_WIDTH,
    CHART_HEIGHT,
  )
  const series: ShareCardSeries[] = withEquity.map((s, i) => ({
    points: pointsPerSeries[i] ?? [],
    color: theme.series[i % theme.series.length] ?? theme.accent,
    label: s.name,
  }))
  downloadCardPng(
    buildCompareShareCardData(strategies, symbol, lang),
    series,
    shareCardFilename('compare', symbol),
    theme,
  )
}

/** Live 画面のペーパートレード実績カード（position ベース）。 */
export function downloadLiveShareCard(
  summary: LiveShareInput,
  lang: Lang,
  theme: ChartTheme,
): void {
  const values = (summary.equity ?? []).map(([, v]) => v)
  const points = normalizeEquity(values, CHART_BOX_WIDTH, CHART_HEIGHT)
  downloadCardPng(
    buildLiveShareCardData(summary, lang),
    [{ points, color: theme.accent }],
    shareCardFilename('live', summary.strategy_id),
    theme,
  )
}
