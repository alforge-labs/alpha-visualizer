import { useMemo, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { VariationBadge } from './components/VariationBadge'
import { type ScreenId } from './components/nav'
import { useViewerSettings } from './hooks/useTheme'
import { useBacktest, useCompare, useWFO } from './hooks/useBacktestData'
import { BacktestScreen } from './screens/BacktestScreen'
import { CompareScreen } from './screens/CompareScreen'
import { ISOOSScreen } from './screens/ISOOSScreen'
import { WFOScreen } from './screens/WFOScreen'
import { L, type Lang } from './i18n/strings'

function readUrl() {
  if (typeof window === 'undefined') return { runId: null, strategyId: null, ids: null }
  const p = new URLSearchParams(window.location.search)
  const runId = p.get('run_id')
  const strategyId = p.get('strategy_id')
  const idsParam = p.get('ids')
  const ids = idsParam ? idsParam.split(',').filter(Boolean) : null
  return { runId, strategyId, ids }
}

export function App() {
  const { settings, update } = useViewerSettings()
  const { theme, density, variation, lang } = settings
  const [screen, setScreen] = useState<ScreenId>('backtest')

  const params = useMemo(readUrl, [])
  const backtest = useBacktest({ runId: params.runId })
  const wfoStrategyId = params.strategyId ?? (backtest.status === 'ready' ? backtest.data.strategy_id : null)
  const wfo = useWFO(wfoStrategyId)
  const compare = useCompare(params.ids)

  const compact = density === 'compact'
  const mainPad = variation === 'clarity' ? 32 : variation === 'terminal' ? 16 : 22

  const symbol = backtest.status === 'ready' ? backtest.data.symbol : '—'
  const strategyName = backtest.status === 'ready' ? backtest.data.strategy_name : '—'
  const timeframe = backtest.status === 'ready' ? backtest.data.timeframe : '—'

  return (
    <div
      className={`v-${variation} ${theme === 'light' ? 't-light' : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg)',
        transition: 'background 0.2s, color 0.2s',
      }}
    >
      <TopBar
        screen={screen}
        setScreen={setScreen}
        lang={lang}
        setLang={(v) => update('lang', v)}
        density={density}
        setDensity={(v) => update('density', v)}
        variation={variation}
        setVariation={(v) => update('variation', v)}
        theme={theme}
        setTheme={(v) => update('theme', v)}
        symbol={symbol}
        strategyName={strategyName}
        timeframe={timeframe}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar screen={screen} setScreen={setScreen} lang={lang} variation={variation} />
        <main style={{ flex: 1, overflowY: 'auto', padding: mainPad, paddingBottom: 60 }}>
          <ScreenContent
            screen={screen}
            backtest={backtest}
            wfo={wfo}
            compare={compare}
            compact={compact}
            lang={lang}
            variation={variation}
            theme={theme}
            symbol={symbol}
          />
        </main>
      </div>

      <VariationBadge variation={variation} />
    </div>
  )
}

interface ScreenContentProps {
  screen: ScreenId
  backtest: ReturnType<typeof useBacktest>
  wfo: ReturnType<typeof useWFO>
  compare: ReturnType<typeof useCompare>
  compact: boolean
  lang: ReturnType<typeof useViewerSettings>['settings']['lang']
  variation: ReturnType<typeof useViewerSettings>['settings']['variation']
  theme: ReturnType<typeof useViewerSettings>['settings']['theme']
  symbol: string
}

function ScreenContent({
  screen,
  backtest,
  wfo,
  compare,
  compact,
  lang,
  variation,
  theme,
  symbol,
}: ScreenContentProps) {
  if (screen === 'backtest') {
    if (backtest.status !== 'ready') return <LoadingOrError state={backtest} lang={lang} />
    return (
      <BacktestScreen
        data={backtest.data}
        compact={compact}
        lang={lang}
        variation={variation}
        theme={theme}
      />
    )
  }
  if (screen === 'wfo') {
    if (wfo.status !== 'ready') return <LoadingOrError state={wfo} lang={lang} />
    return <WFOScreen data={wfo.data} compact={compact} lang={lang} variation={variation} />
  }
  if (screen === 'compare') {
    if (compare.status !== 'ready') return <LoadingOrError state={compare} lang={lang} />
    return <CompareScreen data={compare.data} lang={lang} symbol={symbol} />
  }
  if (screen === 'isoos') {
    if (backtest.status !== 'ready') return <LoadingOrError state={backtest} lang={lang} />
    return (
      <ISOOSScreen data={backtest.data} compact={compact} lang={lang} variation={variation} />
    )
  }
  return null
}

interface State {
  status: 'loading' | 'error' | 'ready'
  error?: string
}

function LoadingOrError({ state, lang }: { state: State; lang: Lang }) {
  if (state.status === 'loading') {
    return (
      <div
        style={{
          padding: 40,
          fontFamily: 'var(--mono)',
          fontSize: 13,
          color: 'var(--text3)',
        }}
      >
        {L(lang, '読み込み中…', 'Loading…')}
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div
        style={{
          padding: 24,
          fontFamily: 'var(--mono)',
          fontSize: 13,
          color: '#ff5c5c',
          background: 'rgba(255,92,92,0.06)',
          border: '1px solid rgba(255,92,92,0.2)',
          borderRadius: 6,
        }}
      >
        {state.error ?? 'Unknown error'}
      </div>
    )
  }
  return null
}
