import { useRef, useState } from 'react'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import { RUN_SOURCE_STRATEGY_FILE } from '../constants/runSource'
import type { BacktestDetail } from '../api/types'
import { useLiveAvailability } from '../hooks/useLiveAvailability'
import { SectionLabel, Tab, TabBar } from '../design/primitives'
import { DashboardProvider } from '../contexts/DashboardContext'
import { useChartTheme } from '../design/useChartTheme'
import { buildEquityCsv, downloadCsv } from '../lib/csv'
import { exportSvgAsPng } from '../lib/exportPng'
import {
  EquityDrawdownPaneTV,
  type EquityDrawdownPaneTVHandle,
} from '../charts/tv/EquityDrawdownPaneTV'
import { MonthlyHeatmapV } from '../charts/visx/MonthlyHeatmapV'
import { RollingMetricsChartTV } from '../charts/tv/RollingMetricsChartTV'
import { ReturnDistributionChart } from '../components/charts/ReturnDistributionChart'
import { WeekdayPerformanceChart } from '../components/charts/WeekdayPerformanceChart'
import { MAEMFEScatter } from '../components/charts/MAEMFEScatter'
import { DrawdownDetailChart } from '../components/charts/DrawdownDetailChart'
import { VaRChart } from '../components/charts/VaRChart'
import { MonteCarloChart } from '../components/charts/MonteCarloChart'
import { CarryAdjustedCard } from '../components/metrics/CarryAdjustedCard'
import { MetricsGrid } from '../components/metrics/MetricsGrid'
import { RegimeBreakdownCards } from '../components/metrics/RegimeBreakdownCards'
import { SignalQualityBadge } from '../components/metrics/SignalQualityBadge'
import { ShareCardButton, ShareCardXButton } from '../components/ShareCardButton'
import { TradeTable } from '../components/trades/TradeTable'
import { AnnualReturnsBar } from '../components/charts/AnnualReturnsBar'
import { LiveTab } from '../components/live/LiveTab'

interface Props {
  data: BacktestDetail
  compact: boolean
  lang: Lang
}

type Tab = 'overview' | 'metrics' | 'performance' | 'trades' | 'risk' | 'monte' | 'live'

function BacktestScreenInner({ data, compact, lang }: Props) {
  const [tab, setTab] = useState<Tab>('overview')
  const hasRegime = !!data.regime_series
  // issue #265: listLive() の失敗を silent に握りつぶさず、liveError として通知する。
  const { hasLive, error: liveError } = useLiveAvailability(data.strategy_id)
  const L = makeL(lang)
  const chartTheme = useChartTheme()

  const heatmapRef = useRef<HTMLDivElement>(null)
  const tvHandleRef = useRef<EquityDrawdownPaneTVHandle>(null)

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

  const baseTabs: ReadonlyArray<readonly [Tab, string]> = [
    ['overview', L('概要', 'Overview')],
    ['metrics', L('メトリクス', 'Metrics')],
    ['performance', L('パフォーマンス', 'Performance')],
    ['trades', L('取引', 'Trades')],
    ['risk', L('リスク', 'Risk')],
    ['monte', L('モンテカルロ', 'Monte Carlo')],
  ]
  const tabs: ReadonlyArray<readonly [Tab, string]> = hasLive
    ? [...baseTabs, ['live', L('ライブ', 'Live')] as const]
    : baseTabs

  const skew = data.metrics.deflated_sharpe?.skewness
  const kurt = data.metrics.deflated_sharpe?.excess_kurtosis
  const showBuyHold = data.buy_hold_equity.length > 0

  return (
    <div data-testid="backtest-screen" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {data.source === RUN_SOURCE_STRATEGY_FILE && (
        <p
          data-testid="source-trial-note"
          role="status"
          style={{
            margin: 0,
            padding: '6px 10px',
            borderRadius: 4,
            border: '1px solid var(--warn)',
            color: 'var(--warn)',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
          }}
        >
          {L(
            'このランは定義ファイル直接実行（保存していないパラメータでのチューニング試行など）です。保存済みの戦略定義とはパラメータが異なる可能性があります。',
            'This run was executed from a definition file (e.g. a tuning trial with unsaved parameters) and may differ from the saved strategy definition.',
          )}
        </p>
      )}
      <TabBar bordered>
        {tabs.map(([id, label]) => (
          <Tab key={id} active={tab === id} onClick={() => setTab(id)} small>
            {label}
          </Tab>
        ))}
      </TabBar>

      {liveError && (
        <p
          role="status"
          title={liveError}
          style={{
            margin: 0,
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            letterSpacing: 'var(--tracking-mono)',
            color: 'var(--warn)',
          }}
        >
          {L('ライブ実績の確認に失敗しました', 'Could not check live results')}
        </p>
      )}

      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <div style={sectionHeaderS}>
              <SectionLabel>
                {L('エクイティ & ドローダウン', 'Equity & Drawdown')}
              </SectionLabel>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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
                  onClick={() => tvHandleRef.current?.exportPng('equity_drawdown.png')}
                >
                  PNG
                </button>
                <ShareCardButton data={data} lang={lang} theme={chartTheme} />
                <ShareCardXButton data={data} lang={lang} theme={chartTheme} />
              </div>
            </div>
            <div data-testid="backtest-equity-chart-tv">
              <EquityDrawdownPaneTV
                ref={tvHandleRef}
                lang={lang}
                equity={data.equity.values}
                dates={data.equity.dates}
                drawdown={data.drawdown}
                isCutoffIdx={data.is_cutoff.index}
                benchmark={showBuyHold ? data.buy_hold_equity : undefined}
                showBenchmark={showBuyHold}
                compact={compact}
                regimeSeries={data.regime_series}
                showRegime={hasRegime}
              />
            </div>
          </div>
        </div>
      )}

      {tab === 'metrics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <MetricsGrid metrics={data.metrics} compact={compact} lang={lang} />
          {data.carry_adjusted && (
            <CarryAdjustedCard carry={data.carry_adjusted} lang={lang} />
          )}
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
            <RollingMetricsChartTV
              lang={lang}
              dailyReturns={data.daily_returns}
              dates={data.equity.dates}
              compact={compact}
            />
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

      {tab === 'live' && (
        <LiveTab strategyId={data.strategy_id} runId={data.run_id} lang={lang} />
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
