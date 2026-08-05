import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { api } from '../api/client'
import type { BacktestSummary, SetupStatusResponse, StrategyListItem } from '../api/types'
import type { GuideSteps } from '../components/start/FirstStrategyGuide'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFetchByKey } from '../hooks/useFetchByKey'
import { publishSetupReady } from '../hooks/useSetupStatus'
import { useViewerSettings } from '../hooks/useTheme'
import { StartScreen } from '../screens/StartScreen'

// useFetchByKey は fetcher の安定参照を前提とするため module-level に置く
const fetchSetupStatus = (): Promise<SetupStatusResponse> => api.getSetupStatus()
const fetchStrategies = (): Promise<StrategyListItem[]> => api.listStrategies()
const fetchResults = (): Promise<BacktestSummary[]> => api.listResults()

/** 「今後表示しない」（issue #493）の永続化キー。既存キーの命名規約に合わせる。 */
const GUIDE_DISMISSED_KEY = 'alphaforge.first_strategy_guide_dismissed.v1'

function readGuideDismissed(): boolean {
  // ローカルの vitest（node 環境）には localStorage が無いため optional に読む
  return globalThis.localStorage?.getItem(GUIDE_DISMISSED_KEY) === '1'
}

/**
 * StartPage（Container、issue #492 / #493）。
 *
 * セットアップ状態 API とガイド完了判定用の軽量一覧（戦略・run）の取得、
 * 「今後表示しない」の localStorage 永続化を担い、Render は StartScreen に
 * 委譲する（ADR-0001）。完了判定は既存 API の件数のみで行い、取得失敗時は
 * null（完了と主張しない）へ縮退する。
 */
export function StartPage(): ReactElement {
  const { settings, update } = useViewerSettings()
  const { lang, theme } = settings
  useDocumentTitle(lang === 'ja' ? 'はじめる' : 'Get Started')

  const [reloadToken, setReloadToken] = useState(0)
  const state = useFetchByKey('setup-status', fetchSetupStatus, { reloadToken })
  const strategiesState = useFetchByKey('start-strategies', fetchStrategies, { reloadToken })
  const resultsState = useFetchByKey('start-results', fetchResults, { reloadToken })

  const [guideDismissed, setGuideDismissed] = useState(readGuideDismissed)
  const dismissGuide = useCallback(() => {
    globalThis.localStorage?.setItem(GUIDE_DISMISSED_KEY, '1')
    setGuideDismissed(true)
  }, [])
  const restoreGuide = useCallback(() => {
    globalThis.localStorage?.removeItem(GUIDE_DISMISSED_KEY)
    setGuideDismissed(false)
  }, [])

  const status = state.status === 'ready' ? state.data : null

  // 新鮮な取得結果を共有ストアへ反映し、ナビの「はじめる」強調がセットアップ
  // 完了（再試行で ready=true）と同時に消えるようにする（issue #493）
  useEffect(() => {
    if (status != null) publishSetupReady(status.ready)
  }, [status])
  const guideSteps = useMemo<GuideSteps>(() => {
    const strategies = strategiesState.status === 'ready' ? strategiesState.data : null
    const results = resultsState.status === 'ready' ? resultsState.data : null
    return {
      dataDone: status != null && status.data.count != null ? status.data.count > 0 : null,
      strategyDone: strategies != null ? strategies.length > 0 : null,
      backtestDone: results != null ? results.length > 0 : null,
      firstStrategyId:
        strategies != null && strategies.length > 0 ? (strategies[0]?.strategy_id ?? null) : null,
    }
  }, [status, strategiesState, resultsState])

  return (
    <StartScreen
      lang={lang}
      theme={theme}
      status={status}
      loading={state.status === 'loading'}
      error={state.status === 'error' ? state.error : null}
      guideSteps={guideSteps}
      guideDismissed={guideDismissed}
      onDismissGuide={dismissGuide}
      onRestoreGuide={restoreGuide}
      onRetry={() => setReloadToken((t) => t + 1)}
      onSetLang={(l) => update('lang', l)}
      onSetTheme={(t) => {
        update('theme', t)
        update('variation', t === 'dark' ? 'lab' : 'atelier')
      }}
    />
  )
}
