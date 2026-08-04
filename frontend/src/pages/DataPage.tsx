import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { api } from '../api/client'
import type { DataListResponse } from '../api/types'
import { useFetchByKey } from '../hooks/useFetchByKey'
import { useViewerSettings } from '../hooks/useTheme'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { makeL } from '../i18n/strings'
import { SettingsToggles } from '../components/SettingsToggles'
import { Chip, ErrorBanner, Loading } from '../design/primitives'
import { extractApiErrorDetail, messageForApiErrorCode } from '../lib/errorMessage'
import { fmtDate, fmtInteger, fmtNumber } from '../lib/format'

// useFetchByKey は fetcher の安定参照を前提とするため module-level に置く
const fetchDatasets = (): Promise<DataListResponse> => api.listDatasets()

/** bytes を KB 表示にする。parquet は数十 KB 規模のため MB では 0 に潰れる。 */
function bytesToKb(bytes: number): string {
  return fmtNumber(bytes / 1024, { decimals: 0, suffix: ' KB' })
}

/**
 * データ管理画面（issue #484）。
 *
 * 保有ヒストリカルデータの存在・鮮度を確認する手段が CLI（`alpha-forge
 * data list`）にしか無く、未取得銘柄はチャートが no_data になるだけで理由が
 * 分からなかった。一覧は `GET /api/data`（forge CLI 委譲）から取得し、
 * TTL 24h を超えたデータには「要更新」バッジを出す。
 *
 * 本画面は参照専用。GUI からの取得・更新ジョブは issue #485 で追加する。
 */
export function DataPage(): ReactElement {
  const { settings, update } = useViewerSettings()
  const { lang, theme } = settings
  const L = makeL(lang)
  useDocumentTitle(lang === 'ja' ? 'データ' : 'Data')

  const [reloadToken, setReloadToken] = useState(0)
  const state = useFetchByKey('datasets', fetchDatasets, { reloadToken })
  const [query, setQuery] = useState('')

  const all = useMemo(
    () => (state.status === 'ready' ? state.data.datasets : []),
    [state],
  )

  const sorted = useMemo(
    () =>
      [...all].sort(
        (a, b) => a.symbol.localeCompare(b.symbol) || a.interval.localeCompare(b.interval),
      ),
    [all],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((d) => d.symbol.toLowerCase().includes(q))
  }, [sorted, query])

  const inputS: React.CSSProperties = {
    padding: '6px 8px',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text)',
    fontFamily: 'var(--mono)',
    fontSize: 'var(--fs-mono-sm)',
  }

  const thS: React.CSSProperties = {
    fontFamily: 'var(--mono)',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text3)',
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  }

  const tdS = (i: number): React.CSSProperties => ({
    padding: '9px 12px',
    borderBottom: '1px solid var(--border)',
    background: i % 2 === 0 ? 'transparent' : 'var(--surface-2)',
    fontFamily: 'var(--mono)',
    fontSize: 14,
    whiteSpace: 'nowrap',
  })

  return (
    <div style={{ padding: 'var(--layout-gutter-y) var(--layout-gutter)', background: 'var(--bg)', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1
          style={{
            margin: '0 0 var(--space-2)',
            fontFamily: 'var(--serif)',
            fontSize: 'var(--browse-fs-h1)',
            fontWeight: 700,
            color: 'var(--text)',
          }}
        >
          {L('データ', 'Data')}
        </h1>
        <SettingsToggles
          lang={lang}
          onSetLang={(l) => update('lang', l)}
          theme={theme}
          onSetTheme={(t) => update('theme', t)}
        />
      </div>
      <p
        style={{
          margin: '0 0 var(--space-5)',
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-caption)',
          color: 'var(--text3)',
        }}
      >
        {L(
          'AlphaForge が保存しているヒストリカルデータの一覧です。バックテストや AI 戦略開発はここにあるデータを使います。最終更新から 24 時間を超えたものには「要更新」が付きます。',
          'Historical data stored by AlphaForge. Backtests and AI strategy development read from this store. Datasets older than 24 hours are marked as stale.',
        )}
      </p>

      {state.status === 'error' && (
        <ErrorBanner
          message={
            messageForApiErrorCode(state.error, lang) ?? extractApiErrorDetail(state.error, lang)
          }
          title={state.error}
          retryLabel={L('再試行', 'Retry')}
          onRetry={() => setReloadToken((t) => t + 1)}
        />
      )}
      {state.status === 'loading' && <Loading label={L('読み込み中…', 'Loading…')} />}

      {state.status === 'ready' && all.length === 0 && (
        <div
          style={{
            padding: 'var(--space-5)',
            border: '1px dashed var(--border)',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--sans)',
            color: 'var(--text2)',
            maxWidth: 640,
          }}
        >
          <p style={{ margin: '0 0 var(--space-2)', fontWeight: 600 }}>
            {L('まだデータがありません。', 'No historical data yet.')}
          </p>
          <p style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--fs-caption)' }}>
            {L(
              'ターミナルで次のコマンドを実行すると取得できます（GUI からの取得は今後追加予定です）:',
              'Run the following command in a terminal to fetch data (fetching from the GUI is planned):',
            )}
          </p>
          <code
            style={{
              display: 'inline-block',
              padding: '6px 10px',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
            }}
          >
            alpha-forge data fetch SPY --period 5y
          </code>
        </div>
      )}

      {state.status === 'ready' && all.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
            <input
              aria-label={L('検索（銘柄）', 'Search (symbol)')}
              placeholder={L('検索（銘柄）…', 'Search (symbol)…')}
              value={query}
              style={{ ...inputS, width: 240, maxWidth: '100%' }}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text3)' }}>
              {filtered.length !== all.length
                ? L(`${filtered.length} / ${all.length} 件`, `${filtered.length} / ${all.length} datasets`)
                : L(`${all.length} 件`, `${all.length} datasets`)}
            </span>
          </div>

          <div className="u-scroll-x" style={{ background: 'var(--bg)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr>
                  <th scope="col" style={{ ...thS, textAlign: 'left' }}>{L('銘柄', 'Symbol')}</th>
                  <th scope="col" style={{ ...thS, textAlign: 'left' }}>{L('足', 'Interval')}</th>
                  <th scope="col" style={{ ...thS, textAlign: 'left' }}>{L('期間', 'Period')}</th>
                  <th scope="col" style={{ ...thS, textAlign: 'right' }}>{L('行数', 'Rows')}</th>
                  <th scope="col" style={{ ...thS, textAlign: 'right' }}>{L('サイズ', 'Size')}</th>
                  <th scope="col" style={{ ...thS, textAlign: 'left' }}>{L('最終更新', 'Updated')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d, i) => (
                  <tr key={`${d.symbol}_${d.interval}`}>
                    <td style={{ ...tdS(i), textAlign: 'left', color: 'var(--text)', fontWeight: 600 }}>
                      {d.symbol}
                    </td>
                    <td style={{ ...tdS(i), textAlign: 'left', color: 'var(--text2)' }}>{d.interval}</td>
                    <td style={{ ...tdS(i), textAlign: 'left', color: 'var(--text2)' }}>
                      {d.start} 〜 {d.end}
                    </td>
                    <td style={{ ...tdS(i), textAlign: 'right', color: 'var(--text2)' }}>
                      {fmtInteger(d.rows)}
                    </td>
                    <td style={{ ...tdS(i), textAlign: 'right', color: 'var(--text2)' }}>
                      {bytesToKb(d.size_bytes)}
                    </td>
                    <td style={{ ...tdS(i), textAlign: 'left', color: 'var(--text2)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        {fmtDate(d.updated_at)}
                        {d.stale === true && <Chip tone="warning">{L('要更新', 'Stale')}</Chip>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
