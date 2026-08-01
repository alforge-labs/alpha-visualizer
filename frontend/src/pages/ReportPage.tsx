import type { ReactElement } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { useBacktest, useStrategyRuns } from '../hooks/useBacktestData'
import { useViewerSettings } from '../hooks/useTheme'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { makeL } from '../i18n/strings'
import { Button, Loading } from '../design/primitives'
import { DashboardProvider } from '../contexts/DashboardContext'
import { MetricsSummaryBarV2 } from '../components/MetricsSummaryBarV2'
import { MetricsGrid } from '../components/metrics/MetricsGrid'
import { EquityDrawdownPaneTV } from '../charts/tv/EquityDrawdownPaneTV'
import { AnnualReturnsBar } from '../components/charts/AnnualReturnsBar'
import { AnnualSummaryTable } from '../components/charts/AnnualSummaryTable'
import { MonthlyHeatmapV } from '../charts/visx/MonthlyHeatmapV'
import { HoldingPeriodChart } from '../components/charts/HoldingPeriodChart'
import { fmtNumber } from '../lib/format'

/**
 * フルレポート（印刷用ビュー）ページ（issue #373）。
 *
 * 主要チャートと指標を 1 ページに縦積みし、ブラウザの印刷（PDF 保存）で
 * run の記録・共有・アーカイブを 1 操作で行えるようにする。
 * RootLayout の外に置き、ナビやフッターを含まない自己完結レイアウト。
 */
export function ReportPage(): ReactElement {
  const { strategyId } = useParams()
  const [searchParams] = useSearchParams()
  const { settings } = useViewerSettings()
  const { lang } = settings
  const L = makeL(lang)
  useDocumentTitle(
    lang === 'ja' ? `レポート — ${strategyId ?? ''}` : `Report — ${strategyId ?? ''}`,
  )

  const runsState = useStrategyRuns(strategyId ?? null, 0)
  const urlRunId = searchParams.get('run_id')
  const latestRunId =
    runsState.status === 'ready' && runsState.data.length > 0
      ? runsState.data[0]!.run_id
      : null
  const runId = urlRunId ?? latestRunId
  const backtest = useBacktest({ runId, reloadToken: 0 })

  const sectionLabelS: React.CSSProperties = {
    margin: '0 0 8px',
    fontFamily: 'var(--sans)',
    fontSize: 'var(--fs-caption)',
    fontWeight: 600,
    color: 'var(--text3)',
    letterSpacing: 'var(--tracking-caption)',
    textTransform: 'uppercase',
  }

  if (backtest.status === 'error' || (runsState.status === 'ready' && runsState.data.length === 0 && !urlRunId)) {
    return (
      <div style={{ padding: 'var(--space-7)', background: 'var(--bg)', minHeight: '100vh' }}>
        <p style={{ fontFamily: 'var(--sans)', color: 'var(--danger)' }}>
          {L('レポートに必要なデータを取得できませんでした', 'Could not load the data needed for the report')}
        </p>
      </div>
    )
  }

  if (backtest.status !== 'ready') {
    return (
      <div style={{ padding: 'var(--space-7)', background: 'var(--bg)', minHeight: '100vh' }}>
        <Loading label={L('レポートを準備中…', 'Preparing report…')} />
      </div>
    )
  }

  const data = backtest.data
  const hasAnnual =
    data.metrics.annual_returns && Object.keys(data.metrics.annual_returns).length > 0
  const startEquity = data.equity.values[0]

  return (
    <DashboardProvider>
      <div
        style={{
          maxWidth: 960,
          margin: '0 auto',
          padding: 'var(--space-6) var(--space-6) var(--space-8)',
          background: 'var(--bg)',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <div
          className="u-no-print"
          style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}
        >
          <Button variant="primary" size="sm" onClick={() => window.print()}>
            {L('印刷 / PDF 保存', 'Print / Save as PDF')}
          </Button>
        </div>

        <header style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--serif)',
              fontSize: 'var(--fs-h2)',
              fontWeight: 700,
              color: 'var(--text)',
            }}
          >
            {strategyId}
          </h1>
          <p
            style={{
              margin: '6px 0 0',
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
              color: 'var(--text3)',
            }}
          >
            {data.run_id}
            {data.period ? ` · ${data.period.start} 〜 ${data.period.end}` : ''}
            {startEquity != null
              ? ` · ${L('開始時評価額', 'Starting equity')} ${fmtNumber(startEquity, { decimals: 0 })}`
              : ''}
          </p>
        </header>

        <MetricsSummaryBarV2 metrics={data.metrics} lang={lang} />

        <section>
          <p style={sectionLabelS}>{L('エクイティ & ドローダウン', 'Equity & Drawdown')}</p>
          <EquityDrawdownPaneTV
            lang={lang}
            equity={data.equity.values}
            dates={data.equity.dates}
            drawdown={data.drawdown}
            isCutoffIdx={data.is_cutoff.index}
            compact={false}
          />
        </section>

        <section>
          <p style={sectionLabelS}>{L('指標', 'Metrics')}</p>
          <MetricsGrid metrics={data.metrics} compact={false} lang={lang} />
        </section>

        {hasAnnual && (
          <section>
            <p style={sectionLabelS}>{L('年次リターン', 'Annual Returns')}</p>
            <AnnualReturnsBar
              annualReturns={data.metrics.annual_returns}
              benchmarkReturns={data.benchmark_annual_returns}
              lang={lang}
              compact
            />
            <AnnualSummaryTable
              annualReturns={data.metrics.annual_returns}
              benchmarkReturns={data.benchmark_annual_returns}
              annualMaxDrawdown={data.metrics.annual_max_drawdown}
              trades={data.trades}
              lang={lang}
            />
          </section>
        )}

        {data.monthly_returns && Object.keys(data.monthly_returns).length > 0 && (
          <section>
            <p style={sectionLabelS}>{L('月別リターン', 'Monthly Returns')}</p>
            <MonthlyHeatmapV data={data.monthly_returns} lang={lang} />
          </section>
        )}

        {data.trades.length > 0 && (
          <section>
            <p style={sectionLabelS}>{L('保有期間分布', 'Holding Period Distribution')}</p>
            <HoldingPeriodChart trades={data.trades} lang={lang} compact />
          </section>
        )}

        <p
          style={{
            margin: 0,
            fontFamily: 'var(--sans)',
            fontSize: 'var(--fs-caption)',
            color: 'var(--text3)',
          }}
        >
          {L(
            `AlphaForge Visualizer レポート · 生成: ${new Date().toISOString().slice(0, 10)}`,
            `AlphaForge Visualizer report · generated: ${new Date().toISOString().slice(0, 10)}`,
          )}
        </p>
      </div>
    </DashboardProvider>
  )
}
