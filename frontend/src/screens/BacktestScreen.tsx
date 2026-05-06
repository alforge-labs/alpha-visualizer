import { useRef, useState } from 'react'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import type { BacktestDetail } from '../api/types'
import { SectionLabel, Tab, TabBar } from '../design/primitives'
import { DashboardProvider } from '../contexts/DashboardContext'
import { useChartTheme } from '../design/useChartTheme'
import { buildEquityCsv, downloadCsv } from '../lib/csv'
import { exportSvgAsPng } from '../lib/exportPng'
import { EquityChartV } from '../charts/visx/EquityChartV'
import { DrawdownChartV } from '../charts/visx/DrawdownChartV'
import { MonthlyHeatmapV } from '../charts/visx/MonthlyHeatmapV'
import { RollingMetricsChart } from '../components/charts/RollingMetricsChart'
import { ReturnDistributionChart } from '../components/charts/ReturnDistributionChart'
import { WeekdayPerformanceChart } from '../components/charts/WeekdayPerformanceChart'
import { MAEMFEScatter } from '../components/charts/MAEMFEScatter'
import { DrawdownDetailChart } from '../components/charts/DrawdownDetailChart'
import { VaRChart } from '../components/charts/VaRChart'
import { MonteCarloChart } from '../components/charts/MonteCarloChart'
import { MetricsGrid } from '../components/metrics/MetricsGrid'
import { RegimeBreakdownCards } from '../components/metrics/RegimeBreakdownCards'
import { SignalQualityBadge } from '../components/metrics/SignalQualityBadge'
import { TradeTable } from '../components/trades/TradeTable'
import { AnnualReturnsBar } from '../components/charts/AnnualReturnsBar'

interface Props {
  data: BacktestDetail
  compact: boolean
  lang: Lang
}

type Tab = 'overview' | 'metrics' | 'performance' | 'trades' | 'risk' | 'monte'

function BacktestScreenInner({ data, compact, lang }: Props) {
  const [tab, setTab] = useState<Tab>('overview')
  const hasRegime = !!data.regime_series
  const [showRegime, setShowRegime] = useState<boolean>(hasRegime)
  const L = makeL(lang)
  const chartTheme = useChartTheme()

  const equityRef = useRef<HTMLDivElement>(null)
  const drawdownRef = useRef<HTMLDivElement>(null)
  const heatmapRef = useRef<HTMLDivElement>(null)

  const exportChartPng = (
    ref: React.RefObject<HTMLDivElement | null>,
    filename: string,
  ) => {
    const svg = ref.current?.querySelector('svg')
    if (svg) void exportSvgAsPng(svg as SVGSVGElement, filename, chartTheme.bg)
  }

  const exportBtnS: React.CSSProperties = {
    height: 26,
    padding: '0 9px',
    borderRadius: 4,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    cursor: 'pointer',
    fontFamily: 'var(--mono)',
    fontSize: 12,
    color: 'var(--text2)',
    letterSpacing: '0.05em',
  }

  const sectionHeaderS: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  }

  const tabs: ReadonlyArray<readonly [Tab, string]> = [
    ['overview', L('概要', 'Overview')],
    ['metrics', L('メトリクス', 'Metrics')],
    ['performance', L('パフォーマンス', 'Performance')],
    ['trades', L('取引', 'Trades')],
    ['risk', L('リスク', 'Risk')],
    ['monte', L('モンテカルロ', 'Monte Carlo')],
  ]

  const skew = data.metrics.deflated_sharpe?.skewness
  const kurt = data.metrics.deflated_sharpe?.excess_kurtosis
  const showBuyHold = data.buy_hold_equity.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <TabBar bordered>
        {tabs.map(([id, label]) => (
          <Tab key={id} active={tab === id} onClick={() => setTab(id)} small>
            {label}
          </Tab>
        ))}
      </TabBar>

      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <div style={sectionHeaderS}>
              <SectionLabel>{L('エクイティ vs Buy&Hold', 'Equity vs Buy & Hold')}</SectionLabel>
              <div style={{ display: 'flex', gap: 6 }}>
                {hasRegime && (
                  <button
                    type="button"
                    aria-pressed={showRegime}
                    style={{
                      ...exportBtnS,
                      background: showRegime ? 'var(--accent-bg)' : 'var(--surface)',
                      borderColor: showRegime ? 'var(--accent-glow)' : 'var(--border)',
                      color: showRegime ? 'var(--accent)' : 'var(--text2)',
                    }}
                    onClick={() => setShowRegime((v) => !v)}
                  >
                    {L('レジーム', 'Regime')}
                  </button>
                )}
                <button
                  type="button"
                  style={exportBtnS}
                  onClick={() => downloadCsv('equity.csv', buildEquityCsv(data.equity, data.drawdown, data.daily_returns))}
                >
                  CSV
                </button>
                <button
                  type="button"
                  style={exportBtnS}
                  onClick={() => exportChartPng(equityRef, 'equity.png')}
                >
                  PNG
                </button>
              </div>
            </div>
            <div ref={equityRef}>
              <EquityChartV
                equity={data.equity.values}
                dates={data.equity.dates}
                isCutoffIdx={data.is_cutoff.index}
                benchmark={showBuyHold ? data.buy_hold_equity : undefined}
                showBenchmark={showBuyHold}
                compact={compact}
                regimeSeries={data.regime_series}
                showRegime={showRegime}
              />
            </div>
          </div>
          <div>
            <div style={sectionHeaderS}>
              <SectionLabel>{L('ドローダウン', 'Drawdown')}</SectionLabel>
              <button
                type="button"
                style={exportBtnS}
                onClick={() => exportChartPng(drawdownRef, 'drawdown.png')}
              >
                PNG
              </button>
            </div>
            <div ref={drawdownRef}>
              <DrawdownChartV
                dd={data.drawdown}
                dates={data.equity.dates}
                isCutoffIdx={data.is_cutoff.index}
                compact={compact}
              />
            </div>
          </div>
        </div>
      )}

      {tab === 'metrics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <MetricsGrid metrics={data.metrics} compact={compact} lang={lang} />
          <SignalQualityBadge metrics={data.metrics} lang={lang} />
        </div>
      )}

      {tab === 'performance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {data.metrics.annual_returns && Object.keys(data.metrics.annual_returns).length > 0 && (
            <div>
              <SectionLabel>{L('年次リターン', 'Annual Returns')}</SectionLabel>
              <AnnualReturnsBar
                annualReturns={data.metrics.annual_returns}
                benchmarkReturns={data.benchmark_annual_returns}
                lang={lang}
                compact={compact}
              />
            </div>
          )}
          <div>
            <div style={sectionHeaderS}>
              <SectionLabel>{L('月別リターン', 'Monthly Returns')}</SectionLabel>
              <button
                type="button"
                style={exportBtnS}
                onClick={() => exportChartPng(heatmapRef, 'monthly_heatmap.png')}
              >
                PNG
              </button>
            </div>
            <div ref={heatmapRef}>
              <MonthlyHeatmapV data={data.monthly_returns} lang={lang} />
            </div>
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
          {data.regime_breakdown && (
            <RegimeBreakdownCards
              breakdown={data.regime_breakdown}
              series={data.regime_series}
              lang={lang}
            />
          )}
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
