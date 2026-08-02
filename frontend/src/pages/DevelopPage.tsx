import type { ReactElement } from 'react'
import { DevelopScreen } from '../screens/DevelopScreen'
import { useAgentBackends } from '../hooks/useAgentBackends'
import { useAgentRunner } from '../hooks/useJobRunner'
import { useViewerSettings } from '../hooks/useTheme'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

/**
 * DevelopPage（Container、Task 10）。
 *
 * 役割:
 * - バックエンド検出 (useAgentBackends) とジョブ起動・購読 (useAgentRunner) の
 *   フック呼び出し
 * - lang の取得（LivePage と同じ `useViewerSettings` 経由）
 *
 * `enabled === false` / 未取得時のガードは Screen 側（DevelopScreen）が担う。
 * ナビの `showDevelop` 非表示だけに頼らず、`/develop` への直接アクセスでも
 * ここで同じ `useAgentBackends` の結果を渡すことで案内が効く。
 *
 * Render は DevelopScreen に委譲する（ADR-0001）。
 */
export function DevelopPage(): ReactElement {
  const { settings } = useViewerSettings()
  const { lang } = settings
  useDocumentTitle(lang === 'ja' ? 'AI 戦略開発' : 'Agent Develop')
  const { data: backends } = useAgentBackends()
  const runner = useAgentRunner()

  return (
    <DevelopScreen
      lang={lang}
      backends={backends}
      running={runner.running}
      status={runner.status}
      logLines={runner.logLines}
      result={runner.result}
      error={runner.error}
      onStart={(goal, symbol, backend) =>
        void runner.start({ goal, symbol: symbol || null, backend })
      }
      onCancel={() => void runner.cancel()}
    />
  )
}
