import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import type { StrategyComparison } from '../api/types'
import { SecHead, SectionLabel } from '../components/common'
import { CompareTable } from '../components/metrics/CompareTable'
import { BenchmarkChart } from '../components/charts/BenchmarkChart'
import { ReturnDistributionChart } from '../components/charts/ReturnDistributionChart'
import { DashboardProvider } from '../contexts/DashboardContext'

interface Props {
  data: StrategyComparison[]
  lang: Lang
  symbol: string
}

export function CompareScreen({ data, lang, symbol }: Props) {
  const L = makeL(lang)
  if (data.length === 0) return null
  const winner = data.reduce((best, s) => (s.sharpe_ratio > best.sharpe_ratio ? s : best), data[0]!)
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <SecHead
        title={L('戦略比較', 'Strategy Comparison')}
        subtitle={`${symbol} · ${L('全期間', 'Full Period')} · ${data.length} ${L('戦略', 'strategies')}`}
        right={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              background: 'var(--accent-bg)',
              border: '1px solid var(--accent-glow)',
              borderRadius: 6,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--text3)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {L('最優秀', 'Winner')}
            </span>
            <span
              style={{
                fontFamily: 'var(--sans)',
                fontSize: 13,
                fontWeight: 700,
                color: '#00e49a',
              }}
            >
              {winner.name}
            </span>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 12,
                color: 'var(--text2)',
              }}
            >
              Sharpe {winner.sharpe_ratio.toFixed(2)}
            </span>
          </div>
        }
      />
      <CompareTable strategies={data} lang={lang} />
      {data.some(s => s.equity) && (
        <DashboardProvider>
          <div style={{ marginTop: 24 }}>
            <SectionLabel>{L('エクイティ比較', 'Equity Comparison')}</SectionLabel>
            <BenchmarkChart
              datasets={data
                .filter(s => s.equity)
                .map((s, i) => ({
                  label: s.name,
                  values: s.equity!.values,
                  dates: s.equity!.dates,
                  color: (['var(--accent)', '#63b3ed', '#f6ad55', '#b794f4'] as const)[i % 4] as string,
                }))}
            />
          </div>
          {data.some(s => s.daily_returns) && (
            <div style={{ marginTop: 24 }}>
              <SectionLabel>{L('リターン分布比較', 'Return Distribution Comparison')}</SectionLabel>
              <ReturnDistributionChart
                datasets={data
                  .filter(s => s.daily_returns)
                  .map((s, i) => ({
                    label: s.name,
                    returns: s.daily_returns!,
                    color: (['var(--accent)', '#63b3ed', '#f6ad55', '#b794f4'] as const)[i % 4] as string,
                  }))}
              />
            </div>
          )}
        </DashboardProvider>
      )}
      <div
        style={{
          marginTop: 20,
          display: 'grid',
          gridTemplateColumns: 'repeat(3,1fr)',
          gap: 10,
        }}
      >
        {data.map((s) => (
          <div
            key={s.id}
            style={{
              background: 'var(--surface)',
              border: `1px solid ${s.is_baseline ? 'rgba(0,228,154,0.25)' : 'var(--border)'}`,
              borderRadius: 8,
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--text)',
                }}
              >
                {s.name}
              </span>
              {s.is_baseline && (
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: '#00e49a',
                    background: 'var(--accent-bg)',
                    padding: '2px 6px',
                    borderRadius: 3,
                  }}
                >
                  BASE
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {(
                [
                  ['Sharpe', s.sharpe_ratio.toFixed(2), s.sharpe_ratio >= 1 ? '#00e49a' : '#f5a623'],
                  [
                    'Return',
                    `${s.total_return_pct.toFixed(1)}%`,
                    s.total_return_pct > 0 ? '#00e49a' : '#ff5c5c',
                  ],
                  ['Max DD', `${s.max_drawdown_pct.toFixed(1)}%`, '#ff5c5c'],
                  [
                    'P.Factor',
                    s.profit_factor.toFixed(2),
                    s.profit_factor >= 1.5 ? '#00e49a' : '#f5a623',
                  ],
                ] as const
              ).map(([k, v, c], i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span
                    style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}
                  >
                    {k}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 14,
                      fontWeight: 700,
                      color: c,
                    }}
                  >
                    {v}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
