import type { ReactElement } from 'react'
import { ParentSize } from '@visx/responsive'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { LivePositionMetrics, LiveSummary } from '../../api/types'
import { SectionLabel } from '../../design/primitives'
import { Sparkline } from '../../charts/visx/Sparkline'
import { diffTone } from './format'
import { fmtDiff, fmtNumber } from '../../lib/format'
import { SummaryCard } from './SummaryCard'

interface Props {
  summary: LiveSummary
  warnings: string[]
  lang: Lang
}

interface MetricDef {
  key: keyof LivePositionMetrics
  jaLabel: string
  enLabel: string
  suffix?: string
  /** true = 値が小さいほど良い（Max DD / Volatility）。diff トーンを反転する */
  invert?: boolean
}

const METRICS: readonly MetricDef[] = [
  { key: 'total_return_pct', jaLabel: 'トータルリターン', enLabel: 'Total Return', suffix: '%' },
  { key: 'cagr_pct', jaLabel: 'CAGR', enLabel: 'CAGR', suffix: '%' },
  { key: 'sharpe_ratio', jaLabel: 'シャープレシオ', enLabel: 'Sharpe' },
  { key: 'max_drawdown_pct', jaLabel: '最大DD', enLabel: 'Max DD', suffix: '%', invert: true },
  { key: 'volatility_pct', jaLabel: 'ボラティリティ', enLabel: 'Volatility', suffix: '%', invert: true },
]

function metricDiff(live: number | null | undefined, bt: number | null | undefined): number | null {
  if (live == null || bt == null) return null
  return live - bt
}

/**
 * position ベース combine portfolio のライブ実績表示（#221）。
 *
 * trade 単位の実績を持たない portfolio（``live_position_summaries`` 由来、
 * ``summary.kind === 'position'``）向けに、equity 由来メトリクスと
 * backtest combine 比較・equity sparkline を描画する。
 */
export function LivePositionView({ summary, warnings, lang }: Props): ReactElement {
  const L = makeL(lang)
  const metrics = summary.metrics ?? {}
  const bt = summary.backtest_metrics ?? null
  const equity = summary.equity ?? []
  const equityValues = equity.map(([, v]) => v)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <SectionLabel>
          {L('ライブ実績サマリー（ポジションベース）', 'Live Summary (position-based)')}
        </SectionLabel>
        <MetaLine summary={summary} warnings={warnings} lang={lang} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginTop: 8,
          }}
        >
          {METRICS.map((m) => {
            const live = metrics[m.key]
            const diff = metricDiff(live, bt?.[m.key])
            return (
              <SummaryCard
                key={m.key}
                testId="live-position-card"
                label={L(m.jaLabel, m.enLabel)}
                value={fmtNumber(live ?? null, m.suffix ? { suffix: m.suffix } : undefined)}
                diff={fmtDiff(diff, m.suffix)}
                diffTone={diffTone(m.invert && diff != null ? -diff : diff)}
                backtest={fmtNumber(bt?.[m.key] ?? null, m.suffix ? { suffix: m.suffix } : undefined)}
                lang={lang}
              />
            )
          })}
        </div>
      </div>

      {equityValues.length > 1 && (
        <div data-testid="live-position-equity">
          <SectionLabel>{L('ライブ equity', 'Live equity')}</SectionLabel>
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              marginTop: 8,
            }}
          >
            <ParentSize>
              {({ width }) =>
                width > 0 ? <Sparkline values={equityValues} width={width} height={140} /> : null
              }
            </ParentSize>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--mono)',
                fontSize: '0.78rem',
                color: 'var(--text3)',
                marginTop: 4,
              }}
            >
              <span>{equity[0]?.[0]?.slice(0, 10)}</span>
              <span>{equity[equity.length - 1]?.[0]?.slice(0, 10)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface MetaLineProps {
  summary: LiveSummary
  warnings: string[]
  lang: Lang
}

function MetaLine({ summary, warnings, lang }: MetaLineProps): ReactElement {
  const L = makeL(lang)
  const subs = summary.sub_strategies ?? []
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        marginTop: 4,
        fontFamily: 'var(--mono)',
        fontSize: '0.78rem',
        color: 'var(--text3)',
      }}
    >
      {summary.receipts_count != null && <span>receipts: {summary.receipts_count}</span>}
      {summary.updated_at && (
        <span>
          {L('更新', 'updated')}: {summary.updated_at.slice(0, 19).replace('T', ' ')}
        </span>
      )}
      {subs.length > 0 && (
        <span>
          {L('構成戦略', 'Strategies')}: {subs.join(', ')}
        </span>
      )}
      {warnings.length > 0 && (
        <span style={{ color: 'var(--text2)' }}>⚠ {warnings.join(' / ')}</span>
      )}
    </div>
  )
}
