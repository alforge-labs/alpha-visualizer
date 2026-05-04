import { useState } from 'react'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import type { Theme, Variation } from '../hooks/useTheme'
import type { BacktestDetail } from '../api/types'
import { Pill, SecHead, SectionLabel } from '../components/common'
import { DashboardProvider } from '../contexts/DashboardContext'
import { MetricsSummaryBar } from '../components/MetricsSummaryBar'
import { DrawdownChart } from '../components/charts/DrawdownChart'
import { BenchmarkChart } from '../components/charts/BenchmarkChart'
import { MonthlyHeatmap } from '../components/charts/MonthlyHeatmap'
import { RollingMetricsChart } from '../components/charts/RollingMetricsChart'
import { ReturnDistributionChart } from '../components/charts/ReturnDistributionChart'
import { WeekdayPerformanceChart } from '../components/charts/WeekdayPerformanceChart'
import { MAEMFEScatter } from '../components/charts/MAEMFEScatter'
import { DrawdownDetailChart } from '../components/charts/DrawdownDetailChart'
import { VaRChart } from '../components/charts/VaRChart'
import { MonteCarloChart } from '../components/charts/MonteCarloChart'
import { MetricsGrid } from '../components/metrics/MetricsGrid'
import { SignalQualityBadge } from '../components/metrics/SignalQualityBadge'
import { TradeTable } from '../components/trades/TradeTable'

interface Props {
  data: BacktestDetail
  compact: boolean
  lang: Lang
  variation: Variation
  theme: Theme
}

type Tab = 'overview' | 'metrics' | 'performance' | 'trades' | 'risk' | 'monte'

function BacktestScreenInner({ data, compact, lang, variation, theme }: Props) {
  const [tab, setTab] = useState<Tab>('overview')
  const L = makeL(lang)

  const tabs: ReadonlyArray<readonly [Tab, string]> = [
    ['overview', L('概要', 'Overview')],
    ['metrics', L('メトリクス', 'Metrics')],
    ['performance', L('パフォーマンス', 'Performance')],
    ['trades', L('取引', 'Trades')],
    ['risk', L('リスク', 'Risk')],
    ['monte', L('モンテカルロ', 'Monte Carlo')],
  ]

  const period = `${data.period.start} → ${data.period.end}`
  const subtitle = `${data.symbol} · ${data.strategy_name} · ${data.timeframe} · ${period}`

  const strategyDataset = {
    label: L('戦略', 'Strategy'),
    values: data.equity.values,
    dates: data.equity.dates,
    color: 'var(--accent)',
  }
  const buyHoldDataset = data.buy_hold_equity.length > 0 ? {
    label: 'Buy & Hold',
    values: data.buy_hold_equity,
    dates: data.equity.dates,
    color: 'var(--text3)',
  } : undefined

  const skew = data.metrics.deflated_sharpe?.skewness
  const kurt = data.metrics.deflated_sharpe?.excess_kurtosis

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <SecHead title={L('バックテスト結果', 'Backtest Results')} subtitle={subtitle} />
      <MetricsSummaryBar metrics={data.metrics} lang={lang} />
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {tabs.map(([id, label]) => (
          <Pill key={id} active={tab === id} onClick={() => setTab(id)}>{label}</Pill>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <SectionLabel>{L('エクイティ vs Buy&Hold', 'Equity vs Buy & Hold')}</SectionLabel>
            <BenchmarkChart
              datasets={buyHoldDataset ? [strategyDataset, buyHoldDataset] : [strategyDataset]}
              compact={compact}
            />
          </div>
          <div>
            <SectionLabel>{L('ドローダウン', 'Drawdown')}</SectionLabel>
            <DrawdownChart dd={data.drawdown} dates={data.equity.dates} isCutoffIdx={data.is_cutoff.index} compact={compact} />
          </div>
        </div>
      )}

      {tab === 'metrics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <MetricsGrid metrics={data.metrics} compact={compact} lang={lang} variation={variation} />
          <SignalQualityBadge metrics={data.metrics} lang={lang} variation={variation} />
        </div>
      )}

      {tab === 'performance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <SectionLabel>{L('月別リターン', 'Monthly Returns')}</SectionLabel>
            <MonthlyHeatmap data={data.monthly_returns} lang={lang} theme={theme} />
          </div>
          <div>
            <SectionLabel>{L('ローリング Sharpe', 'Rolling Sharpe')}</SectionLabel>
            <RollingMetricsChart dailyReturns={data.daily_returns} dates={data.equity.dates} compact={compact} />
          </div>
          <div>
            <SectionLabel>{L('リターン分布', 'Return Distribution')}</SectionLabel>
            <ReturnDistributionChart
              datasets={[{ label: L('日次リターン', 'Daily Returns'), returns: data.daily_returns, color: 'var(--accent)' }]}
              var95={data.metrics.var_95_pct}
              skewness={skew}
              excessKurtosis={kurt}
              compact={compact}
            />
          </div>
          <div>
            <SectionLabel>{L('曜日別パフォーマンス', 'Weekday Performance')}</SectionLabel>
            <WeekdayPerformanceChart dailyReturns={data.daily_returns} dates={data.equity.dates} lang={lang} compact={compact} />
          </div>
        </div>
      )}

      {tab === 'trades' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <SectionLabel>{L('取引一覧', 'Trade List')}</SectionLabel>
            <TradeTable trades={data.trades} lang={lang} />
          </div>
        </div>
      )}

      {tab === 'risk' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <SectionLabel>{L('MAE / MFE 散布図', 'MAE / MFE Scatter')}</SectionLabel>
            <MAEMFEScatter trades={data.trades} lang={lang} compact={compact} />
          </div>
          <div>
            <SectionLabel>{L('ドローダウン TOP5', 'Drawdown TOP5')}</SectionLabel>
            <DrawdownDetailChart drawdown={data.drawdown} dates={data.equity.dates} lang={lang} />
          </div>
          {data.metrics.var_95_pct != null && data.metrics.cvar_95_pct != null && (
            <div>
              <SectionLabel>{L('VaR / CVaR', 'VaR / CVaR')}</SectionLabel>
              <VaRChart
                dailyReturns={data.daily_returns}
                var95={data.metrics.var_95_pct}
                cvar95={data.metrics.cvar_95_pct}
                lang={lang}
              />
            </div>
          )}
        </div>
      )}

      {tab === 'monte' && (
        <div>
          <SectionLabel>{L('モンテカルロ シミュレーション', 'Monte Carlo Simulation')}</SectionLabel>
          <MonteCarloChart trades={data.trades} lang={lang} compact={compact} />
        </div>
      )}
    </div>
  )
}

export function BacktestScreen(props: Props) {
  return (
    <DashboardProvider>
      <BacktestScreenInner {...props} />
    </DashboardProvider>
  )
}
