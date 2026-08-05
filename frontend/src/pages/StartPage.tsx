import { useState } from 'react'
import type { ReactElement } from 'react'
import { api } from '../api/client'
import type { SetupStatusResponse } from '../api/types'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFetchByKey } from '../hooks/useFetchByKey'
import { useViewerSettings } from '../hooks/useTheme'
import { StartScreen } from '../screens/StartScreen'

// useFetchByKey は fetcher の安定参照を前提とするため module-level に置く
const fetchSetupStatus = (): Promise<SetupStatusResponse> => api.getSetupStatus()

/**
 * StartPage（Container、issue #492）。
 *
 * セットアップ状態 API（GET /api/setup/status）の取得・再取得だけを担い、
 * Render は StartScreen に委譲する（ADR-0001）。
 */
export function StartPage(): ReactElement {
  const { settings, update } = useViewerSettings()
  const { lang, theme } = settings
  useDocumentTitle(lang === 'ja' ? 'はじめる' : 'Get Started')

  const [reloadToken, setReloadToken] = useState(0)
  const state = useFetchByKey('setup-status', fetchSetupStatus, { reloadToken })

  return (
    <StartScreen
      lang={lang}
      theme={theme}
      status={state.status === 'ready' ? state.data : null}
      loading={state.status === 'loading'}
      error={state.status === 'error' ? state.error : null}
      onRetry={() => setReloadToken((t) => t + 1)}
      onSetLang={(l) => update('lang', l)}
      onSetTheme={(t) => {
        update('theme', t)
        update('variation', t === 'dark' ? 'lab' : 'atelier')
      }}
    />
  )
}
