import type { CSSProperties, ReactElement } from 'react'
import type { ComponentVersion } from '../../api/types'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { fmtDate } from '../../lib/format'
import { ErrorBanner, Loading } from '../../design/primitives'

export interface VersionsPanelProps {
  components: ComponentVersion[]
  loading: boolean
  error: string | null
  lang: Lang
}

/** API は短い id を返し、表示名はフロントで決める。 */
const DISPLAY_NAME: Record<ComponentVersion['id'], string> = {
  forge: 'alpha-forge',
  visualizer: 'alpha-visualizer',
  strike: 'alpha-strike',
}

// 見出しは MaintenanceScreen.tsx の <h1>（var(--serif)・color: var(--text)）を
// そのまま踏襲し、独自のフォント指定は増やさない。サイズは同一の縮小規約を
// 使う既存の子見出し（components/browser/SymbolCoverageTable.tsx の <h2>）に揃える。
const HEADING_STYLE: CSSProperties = {
  margin: '0 0 12px 0',
  fontFamily: 'var(--serif)',
  fontSize: '1.25rem',
  fontWeight: 600,
  color: 'var(--text)',
  letterSpacing: '-0.005em',
}

// browser ドメイン外のテーブルはローカル定義するのがこのコードベースの流儀
// （MaintenanceScreen.tsx:48-51 のコメントと同じ理由で、この画面の都合で
// 変更されて他画面が巻き添えを食わないようここに持つ）。
const TH_BASE: CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: 'var(--fs-caption)',
  fontWeight: 500,
  letterSpacing: 'var(--tracking-caption)',
  textTransform: 'uppercase',
  padding: '10px 12px',
  background: 'var(--surface)',
  borderBottom: '1px solid var(--border)',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  color: 'var(--text3)',
}

const TD_BASE: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-md)',
  padding: '8px 12px',
  textAlign: 'left',
  borderBottom: '1px solid var(--border)',
  letterSpacing: 'var(--tracking-mono)',
}

const NOTE_STYLE: CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: 'var(--fs-caption)',
  color: 'var(--text3)',
  marginTop: 4,
}

/**
 * 各種ツールのバージョン一覧。
 *
 * `disabled`（remote 無効の alpha-strike）は行ごと出さない。使っていない
 * 連携先を「不明」として並べても、ユーザーには対応すべき問題に見えるだけ。
 */
export function VersionsPanel({
  components,
  loading,
  error,
  lang,
}: VersionsPanelProps): ReactElement {
  const l = makeL(lang)
  const rows = components.filter(c => c.status !== 'disabled')

  if (error) {
    return <ErrorBanner message={error} retryLabel={l('再試行', 'Retry')} title={error} />
  }
  if (loading) {
    return <Loading label={l('バージョンを確認しています…', 'Checking versions…')} rows={3} />
  }

  return (
    <section data-testid="versions-panel">
      <h2 style={HEADING_STYLE}>{l('バージョン', 'Versions')}</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={TH_BASE}>{l('ツール', 'Tool')}</th>
            <th style={TH_BASE}>{l('現在', 'Current')}</th>
            <th style={TH_BASE}>{l('最新', 'Latest')}</th>
            <th style={TH_BASE}>{l('状態', 'Status')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(c => (
            <tr key={c.id}>
              <td style={TD_BASE}>{DISPLAY_NAME[c.id]}</td>
              <td style={TD_BASE}>
                {c.status === 'ok' ? c.current : l('不明', 'Unknown')}
                {/* strike の current は最終同期時点の値。リアルタイムだと
                    誤認させないため、この注記は必ず併記する */}
                {c.as_of ? (
                  <div style={NOTE_STYLE}>
                    {l('最終同期', 'Last synced')}: {fmtDate(c.as_of)}
                  </div>
                ) : null}
              </td>
              <td
                style={{
                  ...TD_BASE,
                  fontWeight: c.update_available ? 700 : 400,
                }}
              >
                {c.latest ?? '—'}
              </td>
              <td style={TD_BASE}>
                {c.update_available
                  ? l('更新があります', 'Update available')
                  : c.status === 'ok'
                    ? l('最新', 'Up to date')
                    : l('不明', 'Unknown')}
                {c.message ? <div style={NOTE_STYLE}>{c.message}</div> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
