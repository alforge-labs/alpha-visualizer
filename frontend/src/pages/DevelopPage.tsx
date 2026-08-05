import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { useSearchParams } from 'react-router'
import { api } from '../api/client'
import type { DataListResponse } from '../api/types'
import { DevelopScreen } from '../screens/DevelopScreen'
import { useAgentBackends } from '../hooks/useAgentBackends'
import { useFetchByKey } from '../hooks/useFetchByKey'
import { useAgentRunner } from '../hooks/useJobRunner'
import { useViewerSettings } from '../hooks/useTheme'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

// useFetchByKey は fetcher の安定参照を前提とするため module-level に置く
const fetchDatasets = (): Promise<DataListResponse> => api.listDatasets()

/**
 * DevelopPage（Container、Task 10）。
 *
 * 役割:
 * - バックエンド検出 (useAgentBackends) とジョブ起動・購読 (useAgentRunner) の
 *   フック呼び出し
 * - lang の取得（LivePage と同じ `useViewerSettings` 経由）
 *
 * `enabled === false` / 未取得時のガード、および `loading` 中の中立表示は
 * Screen 側（DevelopScreen）が担う。ここで `loading` を捨てると初回 fetch
 * 解決までの間 localhost 案内が誤表示されるため、`backendsLoading` として
 * 必ず渡す。ナビの `showDevelop` 非表示だけに頼らず、`/develop` への直接
 * アクセスでもここで同じ `useAgentBackends` の結果を渡すことで案内が効く。
 *
 * Render は DevelopScreen に委譲する（ADR-0001）。
 */
export function DevelopPage(): ReactElement {
  const { settings, update } = useViewerSettings()
  const { lang, theme } = settings
  useDocumentTitle(lang === 'ja' ? 'AI 戦略開発' : 'Agent Develop')
  const { data: backends, loading: backendsLoading } = useAgentBackends()
  const runner = useAgentRunner()

  // 派生開発（issue #491）: Detail の「AI で改善」導線が ?base=<id> で遷移
  // してくる。存在検証はサーバー側（404）が行う。
  const [searchParams] = useSearchParams()
  const baseStrategyId = searchParams.get('base')

  // 未取得銘柄の警告（issue #486）用。取得失敗・未ロード時は null を渡し、
  // Screen 側は警告を出さない（誤警告よりも機能を落とさない縮退を優先）。
  const datasetsState = useFetchByKey('datasets', fetchDatasets)
  const datasetSymbols = useMemo(
    () =>
      datasetsState.status === 'ready'
        ? datasetsState.data.datasets.map((d) => d.symbol)
        : null,
    [datasetsState],
  )

  return (
    <DevelopScreen
      lang={lang}
      theme={theme}
      backends={backends}
      backendsLoading={backendsLoading}
      datasetSymbols={datasetSymbols}
      running={runner.running}
      status={runner.status}
      logLines={runner.logLines}
      result={runner.result}
      error={runner.error}
      baseStrategyId={baseStrategyId}
      onStart={(goal, symbol, backend, maxTurns) =>
        void runner.start({
          goal,
          symbol: symbol || null,
          backend,
          max_turns: maxTurns,
          // 派生でないときはフィールド自体を送らない（既存 API 契約を保つ）
          ...(baseStrategyId != null ? { base_strategy_id: baseStrategyId } : {}),
        })
      }
      onCancel={() => void runner.cancel()}
      onSetLang={(l) => update('lang', l)}
      onSetTheme={(t) => {
        update('theme', t)
        update('variation', t === 'dark' ? 'lab' : 'atelier')
      }}
    />
  )
}
