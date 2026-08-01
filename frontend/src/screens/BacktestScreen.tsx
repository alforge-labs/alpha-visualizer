import { useContext, useMemo, useRef, useState } from 'react'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import { RUN_SOURCE_STRATEGY_FILE } from '../constants/runSource'
import type { BacktestDetail } from '../api/types'
import { useLiveAvailability } from '../hooks/useLiveAvailability'
import { useFetchByKey } from '../hooks/useFetchByKey'
import { api } from '../api/client'
import { compareWithBenchmark } from '../lib/benchmark'
import { fmtNumber as fmtNum } from '../lib/format'
import { SectionLabel, Tab, TabBar } from '../design/primitives'
import { DashboardProvider, DashboardContext, type SyncedTimeRange } from '../contexts/DashboardContext'
import { useChartTheme } from '../design/useChartTheme'
import { buildEquityCsv, downloadCsv } from '../lib/csv'
import { fmtNumber } from '../lib/format'
import { exportSvgAsPng } from '../lib/exportPng'
import {
  EquityDrawdownPaneTV,
  type EquityDrawdownPaneTVHandle,
} from '../charts/tv/EquityDrawdownPaneTV'
import { MonthlyHeatmapV } from '../charts/visx/MonthlyHeatmapV'
import { RollingMetricsChartTV } from '../charts/tv/RollingMetricsChartTV'
import { ReturnDistributionChart } from '../components/charts/ReturnDistributionChart'
import { WeekdayPerformanceChart } from '../components/charts/WeekdayPerformanceChart'
import { HoldingPeriodChart } from '../components/charts/HoldingPeriodChart'
import { SubperiodMetrics } from '../components/metrics/SubperiodMetrics'
import { AnnualSummaryTable } from '../components/charts/AnnualSummaryTable'
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
  // issue #317: レジーム背景バンドの表示切替。regime を持つランでは既定 ON。
  const [showRegime, setShowRegime] = useState<boolean>(hasRegime)
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

  // issue #370: 任意ベンチマーク。銘柄を適用すると OHLC を取得し、
  // 正規化オーバーレイ + 対ベンチ指標をフロント側で計算する
  const [benchInput, setBenchInput] = useState('')
  const [benchSymbol, setBenchSymbol] = useState<string | null>(null)
  const benchKey =
    benchSymbol && data.equity.dates.length > 1
      ? `${benchSymbol}::${data.equity.dates[0]!.slice(0, 10)}::${data.equity.dates[
          data.equity.dates.length - 1
        ]!.slice(0, 10)}`
      : null
  const benchState = useFetchByKey(benchKey, fetchBenchmarkBars)
  const benchComparison = useMemo(() => {
    if (benchState.status !== 'ready') return null
    return compareWithBenchmark({
      equityDates: data.equity.dates,
      equityValues: data.equity.values,
      benchBars: benchState.data,
    })
  }, [benchState, data.equity])

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
      {/* issue #382: この run の使用パラメータ（forge#1356 で保存）。
          チューニング試行の再現に必要な情報を run 単位で常設表示する */}
      {data.params && Object.keys(data.params).length > 0 && (
        <p
          data-testid="run-params"
          style={{
            margin: 0,
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            color: 'var(--text3)',
            letterSpacing: 'var(--tracking-mono)',
            overflowWrap: 'anywhere',
          }}
        >
          {L('使用パラメータ: ', 'Parameters: ')}
          {Object.entries(data.params)
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(' · ')}
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
                  onClick={() => tvHandleRef.current?.exportPng('equity_drawdown.png')}
                >
                  PNG
                </button>
                <ShareCardButton data={data} lang={lang} theme={chartTheme} />
                <ShareCardXButton data={data} lang={lang} theme={chartTheme} />
              </div>
            </div>
            {/* issue #362: 金額の規模感の前提を示す。initial_capital は
                visualizer の DB に無いため、データから取れる事実
                （開始時評価額 = equity 先頭値）と口座通貨建ての注記で代替する */}
            {data.equity.values.length > 0 && (
              <p
                data-testid="capital-context-note"
                style={{
                  margin: '4px 0 6px',
                  fontFamily: 'var(--sans)',
                  fontSize: 'var(--fs-caption)',
                  color: 'var(--text3)',
                }}
              >
                {L(
                  `開始時評価額 ${fmtNumber(data.equity.values[0], { decimals: 0 })} · 金額はバックテスト設定の初期資金に基づく口座通貨建て`,
                  `Starting equity ${fmtNumber(data.equity.values[0], { decimals: 0 })} · amounts are in account currency based on the backtest initial capital`,
                )}
              </p>
            )}
            {/* issue #370: 任意ベンチマークの選択とオーバーレイ・対ベンチ指標 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                margin: '2px 0 6px',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 'var(--fs-caption)',
                  fontWeight: 500,
                  color: 'var(--text3)',
                  letterSpacing: 'var(--tracking-caption)',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                {L('ベンチマーク', 'Benchmark')}
              </span>
              <input
                aria-label={L('ベンチマーク銘柄', 'Benchmark symbol')}
                placeholder={L('例: SPY', 'e.g. SPY')}
                value={benchInput}
                onChange={(e) => setBenchInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && benchInput.trim()) setBenchSymbol(benchInput.trim())
                }}
                style={{
                  width: 100,
                  padding: '4px 8px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text)',
                  fontFamily: 'var(--mono)',
                  fontSize: 'var(--fs-mono-sm)',
                }}
              />
              <button
                type="button"
                style={exportBtnS}
                disabled={!benchInput.trim()}
                onClick={() => setBenchSymbol(benchInput.trim())}
              >
                {L('適用', 'Apply')}
              </button>
              {benchSymbol && (
                <button
                  type="button"
                  style={exportBtnS}
                  onClick={() => {
                    setBenchSymbol(null)
                    setBenchInput('')
                  }}
                >
                  {L('解除', 'Clear')}
                </button>
              )}
              {benchSymbol && benchState.status === 'loading' && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: 'var(--fs-mono-sm)', color: 'var(--text3)' }}>
                  …
                </span>
              )}
              {benchSymbol && (benchState.status === 'no_data' || benchState.status === 'error') && (
                <span style={{ fontFamily: 'var(--sans)', fontSize: 'var(--fs-caption)', color: 'var(--warn)' }}>
                  {L(
                    `${benchSymbol} の価格データを取得できません（forge のデータディレクトリに必要です）`,
                    `No price data for ${benchSymbol} (needs to exist in the forge data directory)`,
                  )}
                </span>
              )}
            </div>
            {benchComparison && (
              <div
                data-testid="benchmark-stats"
                style={{
                  display: 'flex',
                  gap: 20,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  margin: '0 0 8px',
                  padding: '8px 12px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  fontFamily: 'var(--mono)',
                  fontSize: 'var(--fs-mono-sm)',
                  color: 'var(--text2)',
                }}
              >
                <span>
                  vs {benchSymbol}
                </span>
                <span>β {fmtNum(benchComparison.beta, { decimals: 2 })}</span>
                <span>
                  α {fmtNum(benchComparison.alphaPct, { decimals: 1, suffix: '%', sign: true })}
                  {L('（年率）', ' (ann.)')}
                </span>
                <span>IR {fmtNum(benchComparison.informationRatio, { decimals: 2 })}</span>
                <span>
                  {L('超過リターン', 'Excess')}{' '}
                  {fmtNum(benchComparison.excessReturnPct, { decimals: 1, suffix: '%', sign: true })}
                </span>
                <span style={{ color: 'var(--text3)' }}>
                  {L(
                    `${benchComparison.alignedDays} 営業日・日次リターンから算出`,
                    `${benchComparison.alignedDays} trading days, from daily returns`,
                  )}
                </span>
              </div>
            )}
            <div data-testid="backtest-equity-chart-tv">
              <EquityDrawdownPaneTV
                ref={tvHandleRef}
                lang={lang}
                equity={data.equity.values}
                dates={data.equity.dates}
                drawdown={data.drawdown}
                isCutoffIdx={data.is_cutoff.index}
                benchmark={
                  benchComparison
                    ? benchComparison.benchmarkEquity
                    : showBuyHold
                      ? data.buy_hold_equity
                      : undefined
                }
                showBenchmark={Boolean(benchComparison) || showBuyHold}
                compact={compact}
                regimeSeries={data.regime_series}
                showRegime={showRegime}
              />
            </div>
          </div>
        </div>
      )}

      {tab === 'metrics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* issue #377: 期間プリセットで選択期間の主要指標を再計算 */}
          <SubperiodMetrics
            dates={data.equity.dates}
            equity={data.equity.values}
            returns={data.daily_returns}
            lang={lang}
          />
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
              {/* issue #383: バーだけでは正確な年次比較がしにくいため数表を常設 */}
              <AnnualSummaryTable
                annualReturns={data.metrics.annual_returns}
                benchmarkReturns={data.benchmark_annual_returns}
                annualMaxDrawdown={data.metrics.annual_max_drawdown}
                trades={data.trades}
                lang={lang}
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
            <SectionLabel>{L('保有期間分布', 'Holding Period Distribution')}</SectionLabel>
            <HoldingPeriodChart trades={data.trades} lang={lang} compact={compact} />
          </div>
          <div>
            <SectionLabel>{L('取引一覧', 'Trade List')}</SectionLabel>
            <JumpableTradeTable
              trades={data.trades}
              lang={lang}
              onShowOverview={() => setTab('overview')}
            />
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

/** ベンチマーク OHLC の取得（useFetchByKey 用・key = symbol::start::end） */
async function fetchBenchmarkBars(key: string): Promise<{ time: string; close: number }[]> {
  const [symbol, start, end] = key.split('::')
  const res = await api.getHistorical(symbol!, '1d', { start, end })
  return res.bars.map((b) => ({ time: String(b.time), close: b.close }))
}

export function BacktestScreen(props: Props) {
  return (
    <DashboardProvider>
      <BacktestScreenInner {...props} />
    </DashboardProvider>
  )
}


/**
 * 取引一覧 + チャートジャンプ（issue #381）。
 *
 * 行クリックで entry/exit ± 7 日を共有 viewport（issue #318 の同期範囲）に
 * 設定し、概要タブ（エクイティ + 取引マーカー）へ切り替える。
 * DashboardContext を使うため BacktestScreen 本体でなく Provider 配下の
 * 子コンポーネントとして実装する。
 */
function JumpableTradeTable({
  trades,
  lang,
  onShowOverview,
}: {
  trades: BacktestDetail['trades']
  lang: Lang
  onShowOverview: () => void
}): React.ReactElement {
  const ctx = useContext(DashboardContext)

  const handleJump = (t: BacktestDetail['trades'][number]): void => {
    if (!t.entry_date || !t.exit_date) return
    const PAD_MS = 7 * 86_400_000
    const from = new Date(new Date(t.entry_date).getTime() - PAD_MS)
    const to = new Date(new Date(t.exit_date).getTime() + PAD_MS)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return
    ctx?.setSyncedTimeRange({
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    } as SyncedTimeRange)
    onShowOverview()
  }

  return <TradeTable trades={trades} lang={lang} onJumpToTrade={handleJump} />
}
