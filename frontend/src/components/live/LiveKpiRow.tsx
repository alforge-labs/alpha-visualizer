import type { ReactElement } from 'react'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { Stat } from '../../design/primitives'
import { fmtDiff, fmtNumber } from '../../lib/format'
import { diffTone, type DiffTone } from './format'
import {
  currentDrawdown,
  daysBetween,
  dayChangePct,
  excessReturnPt,
  peakIndex,
  totalReturnPct,
} from '../../lib/liveEquity'

interface Props {
  /** ``[[ISO 日時, equity 値], ...]`` の日次系列（live）。 */
  equity: [string, number][]
  /** 指数 buy&hold を initial_capital 基準に正規化した系列。旧 DB では未指定 */
  benchmarkEquity?: [string, number][]
  /** backtest combine を initial_capital 基準に正規化した系列。``--compare`` 時のみ */
  backtestEquity?: [string, number][]
  lang: Lang
}

/** `DiffTone`（good/bad/neutral）を `Stat` の tone 語彙へ変換する。 */
function statTone(tone: DiffTone): 'positive' | 'negative' | 'neutral' {
  if (tone === 'good') return 'positive'
  if (tone === 'bad') return 'negative'
  return 'neutral'
}

/**
 * Live ページの KPI 行 + 超過リターン（issue: Live equity リッチ化 Task 11）。
 *
 * 値の定義は `docs/superpowers/specs/2026-07-25-live-equity-rich-design.md` に固定。
 * 算出そのものは `lib/liveEquity.ts` の純粋関数に委譲し、ここでは整形と
 * レイアウトのみを担う（ADR-0001: 表示専用コンポーネント）。
 *
 * `equity` が空（旧 DB・データ未整備）なら何も描画しない。ベンチマーク／
 * バックテスト比較系列が無い、または 2 点未満の場合は対応する超過リターン
 * カードごと非表示にする（ゼロやダッシュで誤魔化さない）。
 */
export function LiveKpiRow({
  equity,
  benchmarkEquity,
  backtestEquity,
  lang,
}: Props): ReactElement | null {
  const L = makeL(lang)
  if (equity.length === 0) return null

  const dates = equity.map(([d]) => d)
  const values = equity.map(([, v]) => v)
  const lastIdx = values.length - 1
  const last = values[lastIdx] ?? 0
  const first = values[0] ?? 0

  const dayChange = dayChangePct(values)
  const totalPnl = last - first
  const totalPct = totalReturnPct(values)
  const dd = currentDrawdown(values)
  const peakIdx = peakIndex(values)
  const daysSincePeak = daysBetween(dates[peakIdx] ?? '', dates[lastIdx] ?? '')
  const periodDays = daysBetween(dates[0] ?? '', dates[lastIdx] ?? '')

  const benchValues = (benchmarkEquity ?? []).map(([, v]) => v)
  const btValues = (backtestEquity ?? []).map(([, v]) => v)
  const excessIndex = excessReturnPt(values, benchValues)
  const excessBacktest = excessReturnPt(values, btValues)

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-6)' }}>
      <Stat
        testId="kpi-current-value"
        size="lg"
        label={L('現在評価額', 'Current Value')}
        value={fmtNumber(last)}
        sub={dayChange != null ? `${L('前日比', 'Day change')} ${fmtDiff(dayChange * 100, '%')}` : undefined}
        tone={statTone(diffTone(dayChange))}
      />
      <Stat
        testId="kpi-total-pnl"
        size="lg"
        label={L('累計損益', 'Total P&L')}
        value={fmtDiff(totalPnl)}
        sub={fmtDiff(totalPct * 100, '%')}
        tone={statTone(diffTone(totalPnl))}
      />
      <Stat
        testId="kpi-current-dd"
        size="lg"
        label={L('現在DD', 'Current DD')}
        value={fmtNumber(dd * 100, { suffix: '%' })}
        sub={L(`ピークから ${daysSincePeak}日`, `${daysSincePeak}d since peak`)}
        tone={statTone(diffTone(dd))}
      />
      <Stat
        testId="kpi-period"
        size="lg"
        label={L('計測期間', 'Period')}
        value={L(`${periodDays}日`, `${periodDays}d`)}
        sub={dates[0]?.slice(0, 10)}
      />
      {excessIndex != null && (
        <Stat
          testId="kpi-excess-index"
          size="lg"
          label={L('超過リターン vs 指数', 'Excess vs Index')}
          value={fmtDiff(excessIndex, 'pt')}
          tone={statTone(diffTone(excessIndex))}
        />
      )}
      {excessBacktest != null && (
        <Stat
          testId="kpi-excess-backtest"
          size="lg"
          label={L('超過リターン vs BT', 'Excess vs Backtest')}
          value={fmtDiff(excessBacktest, 'pt')}
          tone={statTone(diffTone(excessBacktest))}
        />
      )}
    </div>
  )
}
