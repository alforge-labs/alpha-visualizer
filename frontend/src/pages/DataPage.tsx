import { useCallback, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { useSearchParams } from 'react-router'
import { api } from '../api/client'
import type { DataListResponse, JobStatus } from '../api/types'
import { useFetchByKey } from '../hooks/useFetchByKey'
import { useDataJobRunner } from '../hooks/useJobRunner'
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

// 取得フォームの期間・足の選択肢。値は forge CLI にそのまま渡る。
// 既定 5y: forge 既定（1y）はバックテストには短いことが多く、初中級者が
// 「データが足りない」で詰まるのを避ける。
const PERIOD_OPTIONS = ['1y', '2y', '5y', 'max'] as const
const INTERVAL_OPTIONS = ['1d', '1h', '4h', '1wk'] as const

/** 進捗パネルに表示するログ末尾の行数。 */
const LOG_TAIL_LINES = 8

/**
 * データ管理画面（issue #484 / #485）。
 *
 * 保有ヒストリカルデータの存在・鮮度を確認する手段が CLI（`alpha-forge
 * data list`）にしか無く、未取得銘柄はチャートが no_data になるだけで理由が
 * 分からなかった。一覧は `GET /api/data`（forge CLI 委譲）から取得し、
 * TTL 24h を超えたデータには「要更新」バッジを出す。
 *
 * 取得・一括更新（issue #485）は `POST /api/data/jobs` で非同期実行し、
 * SSE で進捗を表示する。完了したら一覧を再取得する。
 */
export function DataPage(): ReactElement {
  const { settings, update } = useViewerSettings()
  const { lang, theme } = settings
  const L = makeL(lang)
  useDocumentTitle(lang === 'ja' ? 'データ' : 'Data')

  const [reloadToken, setReloadToken] = useState(0)
  const state = useFetchByKey('datasets', fetchDatasets, { reloadToken })
  const [query, setQuery] = useState('')

  // no_data 地点からの導線（issue #486）はプリフィル付きで遷移してくる
  // （例: /data?symbol=CL%3DF&interval=1d）。interval は選択肢に無い値を
  // 受け取っても既定にフォールバックする。
  const [searchParams] = useSearchParams()
  const [symbol, setSymbol] = useState(() => searchParams.get('symbol') ?? '')
  const [period, setPeriod] = useState<string>('5y')
  const [interval, setInterval] = useState<string>(() => {
    const fromQuery = searchParams.get('interval')
    return fromQuery != null && (INTERVAL_OPTIONS as readonly string[]).includes(fromQuery)
      ? fromQuery
      : '1d'
  })

  const onJobFinished = useCallback((status: JobStatus) => {
    // 成功時のみ一覧を再取得する（失敗時に再取得すると、エラー表示と同時に
    // 一覧が動いて「何かが変わった」ように見えてしまう）
    if (status === 'succeeded') setReloadToken((t) => t + 1)
  }, [])
  const runner = useDataJobRunner(onJobFinished)

  const startFetch = useCallback(() => {
    void runner.start({ action: 'fetch', symbol: symbol.trim(), period, interval })
  }, [runner, symbol, period, interval])

  const startUpdate = useCallback(() => {
    void runner.start({ action: 'update' })
  }, [runner])

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

      {/* 取得フォーム（issue #485）。一覧の有無に依らず常時使えるようにする */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          padding: 'var(--space-3) var(--space-4)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--surface)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <span style={{ fontFamily: 'var(--sans)', fontSize: 'var(--fs-caption)', fontWeight: 600, color: 'var(--text2)' }}>
          {L('データ取得', 'Fetch data')}
        </span>
        <input
          aria-label={L('取得する銘柄', 'Symbol to fetch')}
          placeholder="CL=F"
          value={symbol}
          disabled={runner.running}
          style={{ ...inputS, width: 140 }}
          onChange={(e) => setSymbol(e.target.value)}
        />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--sans)', fontSize: 'var(--fs-caption)', color: 'var(--text3)' }}>
          {L('期間', 'Period')}
          <select
            aria-label={L('期間', 'Period')}
            value={period}
            disabled={runner.running}
            style={{ ...inputS, cursor: 'pointer' }}
            onChange={(e) => setPeriod(e.target.value)}
          >
            {PERIOD_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--sans)', fontSize: 'var(--fs-caption)', color: 'var(--text3)' }}>
          {L('足', 'Interval')}
          <select
            aria-label={L('足', 'Interval')}
            value={interval}
            disabled={runner.running}
            style={{ ...inputS, cursor: 'pointer' }}
            onChange={(e) => setInterval(e.target.value)}
          >
            {INTERVAL_OPTIONS.map((iv) => (
              <option key={iv} value={iv}>{iv}</option>
            ))}
          </select>
        </label>
        <button
          onClick={startFetch}
          disabled={runner.running || symbol.trim() === ''}
          style={{
            ...inputS,
            cursor: runner.running || symbol.trim() === '' ? 'default' : 'pointer',
            fontWeight: 600,
          }}
        >
          {L('取得', 'Fetch')}
        </button>
        {state.status === 'ready' && all.length > 0 && (
          <button
            onClick={startUpdate}
            disabled={runner.running}
            title={L('保存済みの全データを差分更新します', 'Incrementally update all stored datasets')}
            style={{ ...inputS, cursor: runner.running ? 'default' : 'pointer', marginLeft: 'auto' }}
          >
            {L('すべて更新', 'Update all')}
          </button>
        )}
      </div>

      {runner.running && (
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-2)',
            marginBottom: 'var(--space-4)',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'var(--space-2)' }}>
            <span style={{ color: 'var(--text2)' }}>
              {L('実行中…', 'Running…')}
            </span>
            <button
              onClick={() => void runner.cancel()}
              style={{ ...inputS, cursor: 'pointer', marginLeft: 'auto' }}
            >
              {L('キャンセル', 'Cancel')}
            </button>
          </div>
          {/* aria-live: ログ更新をスクリーンリーダーに伝える（#473 と同方針） */}
          <pre
            aria-live="polite"
            style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text3)', maxHeight: 160, overflowY: 'auto' }}
          >
            {runner.logLines.slice(-LOG_TAIL_LINES).join('\n')}
          </pre>
        </div>
      )}

      {!runner.running && runner.status === 'failed' && runner.error && (
        <ErrorBanner
          // JobManager の error は translate 済みの利用者向け文言（日英連結）
          message={runner.error}
          retryLabel={L('再試行', 'Retry')}
          onRetry={startFetch}
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
          <p style={{ margin: 0, fontSize: 'var(--fs-caption)' }}>
            {L(
              '上の「データ取得」フォームに銘柄（例: CL=F、SPY、6758.T）を入力して取得してください。',
              'Enter a symbol (e.g. CL=F, SPY, 6758.T) in the fetch form above to download data.',
            )}
          </p>
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
