import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useBacktest, useOptimize, useRunBacktest, useStrategyDetail, useStrategyRuns, useWFO } from '../hooks/useBacktestData'
import { useViewerSettings } from '../hooks/useTheme'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { BacktestScreen } from '../screens/BacktestScreen'
import { ISOOSScreen } from '../screens/ISOOSScreen'
import { WFOScreen } from '../screens/WFOScreen'
import { OptimizeScreen } from '../screens/OptimizeScreen'
import { StrategyScreen } from '../screens/StrategyScreen'
import { RunHistoryTab } from '../components/browser/RunHistoryTab'
import { MetricsSummaryBarV2 } from '../components/MetricsSummaryBarV2'
import { DetailToolbar } from '../components/DetailToolbar'
import { StrategyHero } from '../components/StrategyHero'
import { RunLogDetails } from '../components/RunLogDetails'
import { JobRunnerCard } from '../components/jobs/JobRunnerCard'
import { TuningPanel } from '../components/tuning/TuningPanel'
import { DuplicateStrategyCard } from '../components/tuning/DuplicateStrategyCard'
import { Tab, TabBar } from '../design/primitives/TabBar'
import { Button, ConfirmDialog, ErrorBanner, Loading } from '../design/primitives'
import { normalizeErrorMessage } from '../lib/errorMessage'
import { makeL } from '../i18n/strings'

type DetailTab = 'backtest' | 'isoos' | 'wfo' | 'optimize' | 'history' | 'strategy'

export function DetailPage() {
  const { strategyId } = useParams<{ strategyId: string }>()
  const { settings, update } = useViewerSettings()
  const { lang, density, theme } = settings
  const L = makeL(lang)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<DetailTab>('backtest')
  const [manualRunId, setManualRunId] = useState<string | null>(null)
  // issue #265: 再実行後の更新を全画面リロードでなく再フェッチで行うためのトークン。
  const [reloadToken, setReloadToken] = useState(0)
  const [confirmRun, setConfirmRun] = useState(false)

  const runsState = useStrategyRuns(strategyId ?? null, reloadToken)

  const urlRunId = searchParams.get('run_id')
  const latestRunId =
    runsState.status === 'ready' && runsState.data.length > 0 ? runsState.data[0]!.run_id : null
  const runId = urlRunId ?? manualRunId ?? latestRunId

  // optimize / WFT ジョブ完了時にタブのデータだけ再フェッチするトークン（issue #292）。
  // WFT は forge#1293（optimize walk-forward --save）で DB 記録されるようになった。
  const [optimizeReload, setOptimizeReload] = useState(0)
  // optimize run の切替選択（null = 最新の通常最適化ラン・issue #348）
  const [optimizeRunId, setOptimizeRunId] = useState<string | null>(null)
  const [wfoReload, setWfoReload] = useState(0)
  // パラメータ保存後に戦略詳細を再フェッチするトークン（issue #293）
  const [strategyReload, setStrategyReload] = useState(0)

  const backtest = useBacktest({ runId, reloadToken })
  const wfo = useWFO(strategyId ?? null, wfoReload)
  const optimize = useOptimize(strategyId ?? null, optimizeReload, optimizeRunId)
  const strategyDetail = useStrategyDetail(
    tab === 'strategy' ? (strategyId ?? null) : null,
    strategyReload,
  )
  const compact = density === 'compact'
  const { run: runBt, running: btRunning, error: runError, logTail: runLogTail } = useRunBacktest()

  const currentRunId = backtest.status === 'ready' ? backtest.data.run_id : ''
  const strategyName =
    backtest.status === 'ready' ? backtest.data.strategy_name : (strategyId ?? '')
  useDocumentTitle(strategyName || undefined)
  const symbol = backtest.status === 'ready' ? backtest.data.symbol : ''
  const timeframe = backtest.status === 'ready' ? backtest.data.timeframe : ''
  const periodStart = backtest.status === 'ready' ? backtest.data.period.start : undefined
  const periodEnd = backtest.status === 'ready' ? backtest.data.period.end : undefined
  const isMockData = backtest.status === 'ready' ? backtest.isMock : false

  const handleSelectRun = (id: string) => {
    setManualRunId(id)
    setTab('backtest')
  }

  const requestRun = () => {
    if (!symbol || !strategyId) return
    setConfirmRun(true)
  }

  const doRun = async () => {
    setConfirmRun(false)
    if (!symbol || !strategyId) return
    // timeframe は戦略定義由来のため API へは渡さない（issue #291）。
    const success = await runBt(strategyId, symbol)
    // issue #265: 全画面リロードせず、reloadToken を進めて該当データを再フェッチ
    // （タブ・スクロール位置などの画面状態を保持したまま最新結果へ更新する）。
    if (success) setReloadToken((t) => t + 1)
  }

  const handleAddToCompare = () => {
    if (!strategyId) return
    navigate(`/compare?ids=${strategyId}`)
  }

  // 戦略自体が存在しない（GET /strategies/{id} が 404）場合は、恒久ローディング
  // スケルトンではなく 404 の empty state を表示する (issue #347)。
  if (runsState.status === 'no_data') {
    return (
      <div
        data-testid="strategy-not-found"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          gap: 14,
          background: 'var(--bg)',
          padding: '0 var(--layout-gutter)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-md)',
            color: 'var(--text3)',
            letterSpacing: 'var(--tracking-mono)',
          }}
        >
          404
        </div>
        <h1
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--text)',
            margin: 0,
          }}
        >
          {L('戦略が見つかりません', 'Strategy not found')}
        </h1>
        <p
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-md)',
            color: 'var(--text3)',
            letterSpacing: 'var(--tracking-mono)',
            margin: 0,
            textAlign: 'center',
          }}
        >
          {L(
            `「${strategyId ?? ''}」は削除されたか、ID が誤っている可能性があります。`,
            `"${strategyId ?? ''}" may have been deleted, or the ID may be incorrect.`,
          )}
        </p>
        <Button variant="primary" size="sm" onClick={() => navigate('/browse')}>
          {L('戦略一覧へ戻る', 'Back to strategies')}
        </Button>
      </div>
    )
  }

  // issue #361: 「IS / OOS」「WFO」は略語のままタブ名に登場するため、
  // タブ直下の 1 行サブテキストで初級者向けの概念説明を常設する
  const conceptNoteStyle = {
    margin: '0 0 var(--space-4)',
    fontFamily: 'var(--sans)',
    fontSize: 13,
    color: 'var(--text3)',
    lineHeight: 1.6,
  } as const

  const tabs: ReadonlyArray<readonly [DetailTab, string]> = [
    ['backtest', L('バックテスト', 'Backtest')],
    ['isoos', 'IS / OOS'],
    ['wfo', 'WFO'],
    ['optimize', L('最適化', 'Optimize')],
    ['history', L('実行履歴', 'Run History')],
    ['strategy', L('戦略構成', 'Strategy')],
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
        onSetLang={(l) => update('lang', l)}
        theme={theme}
        onSetTheme={(t) => {
          update('theme', t)
          update('variation', t === 'dark' ? 'lab' : 'atelier')
        }}
        onBack={() => navigate(-1)}
        onRun={requestRun}
        onAddToCompare={handleAddToCompare}
        running={btRunning}
        canRun={Boolean(symbol && strategyId)}
      />

      {runError && (
        <div style={{ padding: 'var(--space-2) var(--layout-gutter)', flexShrink: 0 }}>
          <ErrorBanner
            message={normalizeErrorMessage(runError, lang)}
            title={runError}
            retryLabel={L('再試行', 'Retry')}
            onRetry={doRun}
          />
        </div>
      )}

      {/* 実行ログは再実行結果が反映される backtest タブでのみ表示する（他タブへの残留防止） */}
      {runLogTail && tab === 'backtest' && (
        <div style={{ padding: 'var(--space-2) var(--layout-gutter)', flexShrink: 0 }}>
          <RunLogDetails log={runLogTail} lang={lang} />
        </div>
      )}

      {/* issue #396: 内部スクロールをキーボードで操作できるよう、
          フォーカス可能な named region にする */}
      <div
        role="region"
        aria-label={L('戦略詳細コンテンツ', 'Strategy detail content')}
        tabIndex={0}
        style={{ flex: 1, overflowY: 'auto' }}
      >
        <div
          style={{
            maxWidth: 'var(--container-wide)',
            margin: '0 auto',
            padding: '0 var(--layout-gutter)',
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

          <TabBar ariaLabel={L('詳細タブ', 'Detail tabs')}>
            {tabs.map(([id, label]) => (
              <Tab key={id} active={tab === id} onClick={() => setTab(id)}>
                {label}
              </Tab>
            ))}
          </TabBar>

          <div
            role="tabpanel"
            tabIndex={0}
            aria-label={tabs.find(([id]) => id === tab)?.[1]}
            style={{ paddingBottom: 'var(--space-7)' }}
          >
            {tab === 'backtest' &&
              (backtest.status === 'loading' ? (
                <Loading label={L('読み込み中…', 'Loading…')} />
              ) : backtest.status === 'no_data' ? (
                <Note>
                  {L(
                    'バックテスト結果が見つかりません',
                    'No backtest result found',
                  )}
                </Note>
              ) : backtest.status === 'error' ? (
                <Note tone="danger">{backtest.error}</Note>
              ) : (
                <BacktestScreen data={backtest.data} compact={compact} lang={lang} />
              ))}
            {tab === 'isoos' && (
              <p style={conceptNoteStyle}>
                {L(
                  'IS（In-Sample）= 最適化に使った期間 / OOS（Out-of-Sample）= 検証用に取り置いた期間。OOS が IS より大きく悪化する戦略は過剰適合（カーブフィット）の疑いがあります。',
                  'IS (In-Sample) = the period used for optimization / OOS (Out-of-Sample) = the held-out validation period. A strategy that degrades sharply in OOS is likely overfitted.',
                )}
              </p>
            )}
            {tab === 'isoos' &&
              (backtest.status === 'ready' ? (
                <ISOOSScreen data={backtest.data} compact={compact} lang={lang} />
              ) : (
                <Note>
                  {L('バックテストタブを先に読み込んでください', 'Load Backtest tab first')}
                </Note>
              ))}
            {tab === 'wfo' && (
              <>
                <p style={conceptNoteStyle}>
                  {L(
                    'WFO（ウォークフォワード最適化）= 期間をずらしながら最適化と検証を繰り返し、パラメータの頑健性を確認する手法。OOS 成績が安定していれば、その戦略は実運用でも崩れにくいと期待できます。',
                    'WFO (Walk-Forward Optimization) repeatedly optimizes and validates on rolling windows to test parameter robustness. Stable OOS results suggest the strategy holds up in live trading.',
                  )}
                </p>
                {strategyId && symbol && (
                  <JobRunnerCard
                    kind="wft"
                    strategyId={strategyId}
                    symbol={symbol}
                    lang={lang}
                    onFinished={(s) => {
                      if (s === 'succeeded') setWfoReload((t) => t + 1)
                    }}
                  />
                )}
                {wfo.status === 'loading' ? (
                  <Loading label={L('読み込み中…', 'Loading…')} />
                ) : wfo.status === 'no_data' ? (
                  <Note>
                    {L(
                      'この戦略にはウォークフォワード（WFO）データがありません',
                      'No walk-forward (WFO) data for this strategy',
                    )}
                  </Note>
                ) : wfo.status === 'error' ? (
                  <Note tone="danger">{wfo.error}</Note>
                ) : (
                  <WFOScreen data={wfo.data} compact={compact} lang={lang} />
                )}
              </>
            )}
            {tab === 'optimize' && (
              <>
                {strategyId && symbol && (
                  <JobRunnerCard
                    kind="optimize"
                    strategyId={strategyId}
                    symbol={symbol}
                    lang={lang}
                    onFinished={(s) => {
                      if (s === 'succeeded') {
                        // 新しい run が最新になるため選択をリセットして最新を表示
                        setOptimizeRunId(null)
                        setOptimizeReload((t) => t + 1)
                      }
                    }}
                  />
                )}
                {optimize.status === 'loading' ? (
                  <Loading label={L('読み込み中…', 'Loading…')} />
                ) : optimize.status === 'no_data' ? (
                  <Note>
                    {L(
                      'この戦略には最適化（Optimize）データがありません',
                      'No optimization data for this strategy',
                    )}
                  </Note>
                ) : optimize.status === 'error' ? (
                  <Note tone="danger">{optimize.error}</Note>
                ) : (
                  <OptimizeScreen
                    data={optimize.data}
                    compact={compact}
                    lang={lang}
                    onSelectRun={setOptimizeRunId}
                  />
                )}
              </>
            )}
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
                <Loading label={L('読み込み中…', 'Loading…')} />
              ))}
            {tab === 'strategy' &&
              (strategyDetail.status === 'loading' ? (
                <Loading label={L('読み込み中…', 'Loading…')} />
              ) : strategyDetail.status === 'no_data' ? (
                <Note>
                  {L(
                    '戦略定義が見つかりません',
                    'No strategy definition found',
                  )}
                </Note>
              ) : strategyDetail.status === 'error' ? (
                <Note tone="danger">{strategyDetail.error}</Note>
              ) : (
                <>
                  {strategyId && (
                    <TuningPanel
                      // 戦略切替時に編集・ジョブ実行状態ごと再マウントして破棄する
                      // （前戦略の比較テーブルが残る誤表示防止）
                      key={strategyId}
                      strategyId={strategyId}
                      symbol={symbol || null}
                      parameters={strategyDetail.data.parameters}
                      baseline={
                        runsState.status === 'ready' && runsState.data.length > 0
                          ? {
                              sharpe: runsState.data[0]!.sharpe_ratio,
                              returnPct: runsState.data[0]!.total_return_pct,
                              maxDrawdownPct: runsState.data[0]!.max_drawdown_pct,
                            }
                          : null
                      }
                      lang={lang}
                      onSaved={() => setStrategyReload((t) => t + 1)}
                    />
                  )}
                  {strategyId && (
                    <DuplicateStrategyCard
                      key={`dup-${strategyId}`}
                      strategyId={strategyId}
                      lang={lang}
                      onDuplicated={(newId) => navigate(`/detail/${newId}`)}
                    />
                  )}
                  <StrategyScreen
                    data={strategyDetail.data}
                    lang={lang}
                    symbol={backtest.status === 'ready' ? backtest.data.symbol : null}
                    trades={backtest.status === 'ready' ? backtest.data.trades : []}
                    regimeSeries={
                      backtest.status === 'ready' ? backtest.data.regime_series ?? null : null
                    }
                  />
                </>
              ))}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRun}
        title={L('バックテスト再実行', 'Re-run backtest')}
        message={L(
          '新しい実行結果が追加され、表示は最新の結果に切り替わります（過去の結果は実行履歴に残ります）。実行しますか？',
          'A new run will be added and the view will switch to the latest result (past results remain in the run history). Continue?',
        )}
        confirmLabel={btRunning ? L('実行中…', 'Running…') : L('実行', 'Run')}
        cancelLabel={L('やめる', 'Cancel')}
        onConfirm={doRun}
        onCancel={() => setConfirmRun(false)}
      />
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
