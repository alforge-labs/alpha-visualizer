import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useBacktest, useRunBacktest, useStrategyRuns, useWFO } from '../hooks/useBacktestData'
import { useViewerSettings } from '../hooks/useTheme'
import { BacktestScreen } from '../screens/BacktestScreen'
import { ISOOSScreen } from '../screens/ISOOSScreen'
import { WFOScreen } from '../screens/WFOScreen'
import { RunHistoryTab } from '../components/browser/RunHistoryTab'
import { MetricsSummaryBarV2 } from '../components/MetricsSummaryBarV2'
import { DetailToolbar } from '../components/DetailToolbar'
import { StrategyHero } from '../components/StrategyHero'
import { Tab, TabBar } from '../design/primitives/TabBar'
import { makeL } from '../i18n/strings'

type DetailTab = 'backtest' | 'isoos' | 'wfo' | 'history'

export function DetailPage() {
  const { strategyId } = useParams<{ strategyId: string }>()
  const { settings, update } = useViewerSettings()
  const { lang, density, variation } = settings
  const L = makeL(lang)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<DetailTab>('backtest')
  const [manualRunId, setManualRunId] = useState<string | null>(null)

  const runsState = useStrategyRuns(strategyId ?? null)

  const urlRunId = searchParams.get('run_id')
  const latestRunId =
    runsState.status === 'ready' && runsState.data.length > 0 ? runsState.data[0]!.run_id : null
  const runId = urlRunId ?? manualRunId ?? latestRunId

  const backtest = useBacktest({ runId })
  const wfo = useWFO(strategyId ?? null)
  const compact = density === 'compact'
  const { run: runBt, running: btRunning, error: runError } = useRunBacktest()

  const currentRunId = backtest.status === 'ready' ? backtest.data.run_id : ''
  const strategyName =
    backtest.status === 'ready' ? backtest.data.strategy_name : (strategyId ?? '')
  const symbol = backtest.status === 'ready' ? backtest.data.symbol : ''
  const timeframe = backtest.status === 'ready' ? backtest.data.timeframe : ''
  const periodStart = backtest.status === 'ready' ? backtest.data.period.start : undefined
  const periodEnd = backtest.status === 'ready' ? backtest.data.period.end : undefined
  const isMockData = backtest.status === 'ready' ? backtest.isMock : false

  const handleSelectRun = (id: string) => {
    setManualRunId(id)
    setTab('backtest')
  }

  const handleRun = async () => {
    if (!symbol || !timeframe || !strategyId) return
    const ok = window.confirm(
      lang === 'ja'
        ? '再実行すると最新結果が上書きされます。続けますか？'
        : 'Re-running will overwrite the latest result. Continue?'
    )
    if (!ok) return
    const success = await runBt(strategyId, symbol, timeframe)
    if (success) window.location.reload()
  }

  const handleAddToCompare = () => {
    if (!strategyId) return
    navigate(`/compare?ids=${strategyId}`)
  }

  const tabs: ReadonlyArray<readonly [DetailTab, string]> = [
    ['backtest', L('バックテスト', 'Backtest')],
    ['isoos', 'IS / OOS'],
    ['wfo', 'WFO'],
    ['history', L('実行履歴', 'Run History')],
  ]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--bg)',
        overflow: 'hidden',
      }}
    >
      <DetailToolbar
        strategyName={strategyName}
        symbol={symbol}
        timeframe={timeframe}
        lang={lang}
        variation={variation}
        onSetVariation={(v) => update('variation', v)}
        onSetLang={(l) => update('lang', l)}
        onBack={() => navigate('/browse')}
        onRun={handleRun}
        onAddToCompare={handleAddToCompare}
        running={btRunning}
        canRun={Boolean(symbol && timeframe && strategyId)}
      />

      {runError && (
        <div
          style={{
            padding: 'var(--space-2) var(--space-6)',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            letterSpacing: 'var(--tracking-mono)',
            color: 'var(--danger)',
            background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          {runError}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div
          style={{
            maxWidth: 'var(--container-wide)',
            margin: '0 auto',
            padding: '0 var(--space-6)',
          }}
        >
          <StrategyHero
            strategyName={strategyName}
            symbol={symbol}
            timeframe={timeframe}
            periodStart={periodStart}
            periodEnd={periodEnd}
            isMock={isMockData}
            lang={lang}
          />

          {backtest.status === 'ready' && !backtest.isMock && (
            <MetricsSummaryBarV2 metrics={backtest.data.metrics} lang={lang} />
          )}

          <TabBar>
            {tabs.map(([id, label]) => (
              <Tab key={id} active={tab === id} onClick={() => setTab(id)}>
                {label}
              </Tab>
            ))}
          </TabBar>

          <div style={{ paddingBottom: 'var(--space-7)' }}>
            {tab === 'backtest' &&
              (backtest.status === 'loading' ? (
                <Note>{L('読み込み中…', 'Loading…')}</Note>
              ) : backtest.status === 'error' ? (
                <Note tone="danger">{backtest.error}</Note>
              ) : (
                <BacktestScreen data={backtest.data} compact={compact} lang={lang} />
              ))}
            {tab === 'isoos' &&
              (backtest.status === 'ready' ? (
                <ISOOSScreen data={backtest.data} compact={compact} lang={lang} />
              ) : (
                <Note>
                  {L('バックテストタブを先に読み込んでください', 'Load Backtest tab first')}
                </Note>
              ))}
            {tab === 'wfo' &&
              (wfo.status === 'loading' ? (
                <Note>{L('読み込み中…', 'Loading…')}</Note>
              ) : wfo.status === 'error' ? (
                <Note tone="danger">{wfo.error}</Note>
              ) : (
                <WFOScreen data={wfo.data} compact={compact} lang={lang} />
              ))}
            {tab === 'history' &&
              (runsState.status === 'ready' ? (
                <RunHistoryTab
                  runs={runsState.data}
                  currentRunId={currentRunId}
                  onSelectRun={handleSelectRun}
                  lang={lang}
                />
              ) : runsState.status === 'error' ? (
                <Note tone="danger">{runsState.error}</Note>
              ) : (
                <Note>{L('読み込み中…', 'Loading…')}</Note>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Note({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode
  tone?: 'muted' | 'danger'
}) {
  return (
    <div
      style={{
        padding: 'var(--space-6) 0',
        fontFamily: 'var(--mono)',
        fontSize: 'var(--fs-mono-sm)',
        letterSpacing: 'var(--tracking-mono)',
        color: tone === 'danger' ? 'var(--danger)' : 'var(--text3)',
      }}
    >
      {children}
    </div>
  )
}
