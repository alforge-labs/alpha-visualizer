import { useMemo, useState } from 'react'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import type { StrategyComparison } from '../api/types'
import { Card, Chip, Divider, SectionHeader, Stat } from '../design/primitives'
import { CompareTable } from '../components/metrics/CompareTable'
import { CompareEquityV } from '../charts/visx/CompareEquityV'
import type { CompareSeries } from '../charts/visx/CompareEquityV'
import { CompareEquityTV } from '../charts/tv/CompareEquityTV'
import { ReturnDistributionChart } from '../components/charts/ReturnDistributionChart'
import { CorrelationHeatmap } from '../components/charts/CorrelationHeatmap'
import { DashboardProvider } from '../contexts/DashboardContext'
import { useChartTheme } from '../design/useChartTheme'
import { resolveLightweightChartsFlag } from '../constants/featureFlags'

interface Props {
  data: StrategyComparison[]
  lang: Lang
  symbol: string
}

const SECTION_LABEL: React.CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: 'var(--fs-caption)',
  fontWeight: 500,
  color: 'var(--text3)',
  letterSpacing: 'var(--tracking-caption)',
  textTransform: 'uppercase',
}

function returnTone(v: number | null | undefined): 'positive' | 'negative' | 'neutral' {
  if (v == null) return 'neutral'
  return v >= 0 ? 'positive' : 'negative'
}

function sharpeTone(v: number | null | undefined): 'positive' | 'warning' | 'negative' | 'neutral' {
  if (v == null) return 'neutral'
  if (v >= 1.5) return 'positive'
  if (v >= 1.0) return 'warning'
  return 'negative'
}

export function CompareScreen({ data, lang, symbol }: Props): React.ReactElement | null {
  const L = makeL(lang)
  const theme = useChartTheme()
  const [useTv] = useState<boolean>(() => resolveLightweightChartsFlag())

  const series: CompareSeries[] = useMemo(() => {
    return data
      .filter(s => s.equity)
      .map((s, i) => ({
        id: s.id,
        label: s.name,
        values: s.equity!.values,
        dates: s.equity!.dates,
        color: theme.series[i % theme.series.length] ?? '#888',
        isBaseline: s.is_baseline,
      }))
  }, [data, theme.series])

  if (data.length === 0) return null

  const winner = data.reduce(
    (best, s) =>
      (s.sharpe_ratio ?? -Infinity) > (best.sharpe_ratio ?? -Infinity) ? s : best,
    data[0]!,
  )

  const distributionDatasets = data
    .filter(s => s.daily_returns)
    .map((s, i) => ({
      label: s.name,
      returns: s.daily_returns!,
      color: theme.series[i % theme.series.length] ?? '#888',
    }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <SectionHeader
        title={L('戦略比較', 'Strategy comparison')}
        subtitle={`${symbol} · ${L('全期間', 'Full period')} · ${data.length} ${L('戦略', 'strategies')}`}
        right={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 14px',
              background: 'var(--accent-bg)',
              border: '1px solid var(--accent-glow)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <span style={SECTION_LABEL}>{L('最優秀', 'Winner')}</span>
            <span
              style={{
                fontFamily: 'var(--serif)',
                fontSize: '1rem',
                fontWeight: 600,
                color: 'var(--text)',
                letterSpacing: '-0.005em',
              }}
            >
              {winner.name}
            </span>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-md)',
                fontWeight: 600,
                color: 'var(--accent)',
                letterSpacing: 'var(--tracking-mono)',
              }}
            >
              Sharpe {(winner.sharpe_ratio ?? 0).toFixed(2)}
            </span>
          </div>
        }
      />

      {/* メイン: 2/3 (左 chart) + 1/3 (右 stat 縦積み) — 1024px 以下では縦積み */}
      <div
        data-testid="compare-main-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'var(--compare-grid)',
          gap: 'var(--space-5)',
        }}
      >
        {/* 左: equity chart */}
        <Card>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-4)',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={SECTION_LABEL}>
              {L('正規化エクイティ（開始 = 0%）', 'Normalized equity (start = 0%)')}
            </div>
            {/* 凡例 */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {series.map(s => (
                <span
                  key={s.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    fontFamily: 'var(--mono)',
                    fontSize: 'var(--fs-mono-sm)',
                    color: 'var(--text2)',
                    letterSpacing: 'var(--tracking-mono)',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 14,
                      height: 2,
                      background: s.color,
                      borderRadius: 1,
                    }}
                  />
                  <span style={{ fontFamily: 'var(--serif)', fontSize: 'var(--fs-body)', fontWeight: 600 }}>
                    {s.label}
                  </span>
                  {s.isBaseline && <Chip tone="accent">Base</Chip>}
                </span>
              ))}
            </div>
          </div>

          {series.length > 0 ? (
            useTv ? (
              <CompareEquityTV series={series} height={320} />
            ) : (
              <CompareEquityV series={series} height={320} />
            )
          ) : (
            <p
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-sm)',
                color: 'var(--text3)',
                margin: '24px 0',
                letterSpacing: 'var(--tracking-mono)',
              }}
            >
              {L('エクイティデータがありません', 'No equity data available')}
            </p>
          )}
        </Card>

        {/* 右: 戦略 stat 縦積み */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          {data.map((s, i) => {
            const seriesColor = theme.series[i % theme.series.length] ?? 'var(--text2)'
            return (
              <Card key={s.id} variant="default" style={{ paddingTop: 'var(--space-4)', paddingBottom: 'var(--space-4)' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: 'var(--space-3)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 12,
                        height: 12,
                        borderRadius: 999,
                        background: seriesColor,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: 'var(--serif)',
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: 'var(--text)',
                        letterSpacing: '-0.005em',
                      }}
                    >
                      {s.name}
                    </span>
                  </div>
                  {s.is_baseline && <Chip tone="accent">Base</Chip>}
                </div>
                <Divider />
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 'var(--space-3) var(--space-4)',
                    marginTop: 'var(--space-3)',
                  }}
                >
                  <Stat
                    label="Sharpe"
                    value={(s.sharpe_ratio ?? 0).toFixed(2)}
                    tone={sharpeTone(s.sharpe_ratio)}
                    size="md"
                  />
                  <Stat
                    label={L('リターン', 'Return')}
                    value={`${(s.total_return_pct ?? 0).toFixed(1)}%`}
                    tone={returnTone(s.total_return_pct)}
                    size="md"
                  />
                  <Stat
                    label="Max DD"
                    value={`${(s.max_drawdown_pct ?? 0).toFixed(1)}%`}
                    tone="negative"
                    size="md"
                  />
                  <Stat
                    label="P.Factor"
                    value={(s.profit_factor ?? 0).toFixed(2)}
                    tone={(s.profit_factor ?? 0) >= 1.5 ? 'positive' : 'warning'}
                    size="md"
                  />
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      {/* 下: 詳細テーブル */}
      <CompareTable strategies={data} lang={lang} />

      {/* 下々: 分布比較 */}
      {distributionDatasets.length > 0 && (
        <DashboardProvider>
          <Card>
            <div style={{ ...SECTION_LABEL, marginBottom: 'var(--space-4)' }}>
              {L('リターン分布比較', 'Return distribution')}
            </div>
            <ReturnDistributionChart datasets={distributionDatasets} compact />
          </Card>
        </DashboardProvider>
      )}

      {/* 末尾: 戦略間相関ヒートマップ（issue #55） */}
      <CorrelationHeatmap strategies={data} lang={lang} />
    </div>
  )
}
