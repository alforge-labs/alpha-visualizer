import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { Link } from 'react-router'
import { api } from '../api/client'
import type { BacktestSummary } from '../api/types'
import { useFetchByKey } from '../hooks/useFetchByKey'
import { useViewerSettings } from '../hooks/useTheme'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { makeL } from '../i18n/strings'
import { ErrorBanner, Loading } from '../design/primitives'
import { SortHeaderCell } from '../design/primitives/SortHeaderCell'
import { normalizeErrorMessage } from '../lib/errorMessage'
import { fmtNumber, fmtDate } from '../lib/format'

type SortKey = 'run_at' | 'sharpe_ratio' | 'total_return_pct' | 'max_drawdown_pct' | 'total_trades'

const PAGE_SIZE = 50

// useFetchByKey は fetcher の安定参照を前提とするため module-level に置く
const fetchRuns = (): Promise<BacktestSummary[]> => api.listResults()

/**
 * 全 run 横断エクスプローラ（issue #374）。
 *
 * run は第一級の資産なのに戦略単位（Detail の実行履歴）でしか辿れなかった。
 * `GET /api/results`（#384 でスカラー列のみの軽量応答化済み）を全件取得し、
 * 検索・銘柄・期間・Sharpe 下限のフィルタとソートをフロント側で行う。
 */
export function RunsPage(): ReactElement {
  const { settings } = useViewerSettings()
  const { lang } = settings
  const L = makeL(lang)
  useDocumentTitle(lang === 'ja' ? '実行一覧' : 'Runs')

  const [reloadToken, setReloadToken] = useState(0)
  const state = useFetchByKey('runs', fetchRuns, { reloadToken })

  const [query, setQuery] = useState('')
  const [symbol, setSymbol] = useState('')
  const [sharpeMin, setSharpeMin] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'run_at', dir: -1 })
  const [page, setPage] = useState(0)

  const all = state.status === 'ready' ? state.data : []

  const symbols = useMemo(
    () => [...new Set(all.map((r) => r.symbol).filter((s): s is string => Boolean(s)))].sort(),
    [all],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const min = sharpeMin === '' ? null : Number(sharpeMin)
    return all.filter((r) => {
      if (q && !`${r.strategy_id ?? ''} ${r.run_id}`.toLowerCase().includes(q)) return false
      if (symbol && r.symbol !== symbol) return false
      if (min != null && !Number.isNaN(min) && !((r.sharpe_ratio ?? Number.NEGATIVE_INFINITY) >= min))
        return false
      const day = r.run_at?.slice(0, 10) ?? ''
      if (dateFrom && day < dateFrom) return false
      if (dateTo && day > dateTo) return false
      return true
    })
  }, [all, query, symbol, sharpeMin, dateFrom, dateTo])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sort.key]
      const bv = b[sort.key]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * sort.dir
      return ((av as number) - (bv as number)) * sort.dir
    })
  }, [filtered, sort])

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE) || 1
  const safePage = Math.min(page, totalPages - 1)
  const paged = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const toggleSort = (key: SortKey): void =>
    setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : -1 }))

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
    cursor: 'pointer',
    userSelect: 'none',
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
      <h1
        style={{
          margin: '0 0 var(--space-2)',
          fontFamily: 'var(--serif)',
          fontSize: 'var(--browse-fs-h1)',
          fontWeight: 700,
          color: 'var(--text)',
        }}
      >
        {L('実行一覧', 'Runs')}
      </h1>
      <p
        style={{
          margin: '0 0 var(--space-5)',
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-caption)',
          color: 'var(--text3)',
        }}
      >
        {L(
          '全戦略のバックテスト実行を横断して検索・絞り込みできます。行をクリックすると該当 run の詳細を開きます。',
          'Search and filter backtest runs across all strategies. Click a row to open that run.',
        )}
      </p>

      {state.status === 'error' && (
        <ErrorBanner
          message={normalizeErrorMessage(state.error, lang)}
          title={state.error}
          retryLabel={L('再試行', 'Retry')}
          onRetry={() => setReloadToken((t) => t + 1)}
        />
      )}
      {state.status === 'loading' && <Loading label={L('読み込み中…', 'Loading…')} />}

      {state.status === 'ready' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
            <input
              aria-label={L('検索（戦略 ID / run ID）', 'Search (strategy ID / run ID)')}
              placeholder={L('検索（戦略 ID / run ID）…', 'Search (strategy / run ID)…')}
              value={query}
              style={{ ...inputS, width: 240, maxWidth: '100%' }}
              onChange={(e) => { setQuery(e.target.value); setPage(0) }}
            />
            <select
              aria-label={L('銘柄で絞り込み', 'Filter by symbol')}
              value={symbol}
              style={{ ...inputS, cursor: 'pointer' }}
              onChange={(e) => { setSymbol(e.target.value); setPage(0) }}
            >
              <option value="">{L('全銘柄', 'All symbols')}</option>
              {symbols.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'var(--sans)', fontSize: 'var(--fs-caption)', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                Sharpe ≥
              </span>
              <input
                type="number"
                step="0.1"
                aria-label={L('Sharpe 下限', 'Minimum Sharpe')}
                value={sharpeMin}
                placeholder="1.0"
                style={{ ...inputS, width: 64 }}
                onChange={(e) => { setSharpeMin(e.target.value); setPage(0) }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="date"
                aria-label={L('開始日', 'From date')}
                value={dateFrom}
                style={inputS}
                onChange={(e) => { setDateFrom(e.target.value); setPage(0) }}
              />
              <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 12 }}>〜</span>
              <input
                type="date"
                aria-label={L('終了日', 'To date')}
                value={dateTo}
                style={inputS}
                onChange={(e) => { setDateTo(e.target.value); setPage(0) }}
              />
            </div>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text3)' }}>
              {filtered.length !== all.length
                ? L(`${filtered.length} / ${all.length} 件`, `${filtered.length} / ${all.length} runs`)
                : L(`${all.length} 件`, `${all.length} runs`)}
            </span>
          </div>

          <div className="u-scroll-x" style={{ background: 'var(--bg)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr>
                  <th scope="col" style={{ ...thS, cursor: 'default', textAlign: 'left' }}>
                    {L('戦略 / run', 'Strategy / run')}
                  </th>
                  <th scope="col" style={{ ...thS, cursor: 'default', textAlign: 'left' }}>
                    {L('銘柄', 'Symbol')}
                  </th>
                  <SortHeaderCell
                    label={L('実行日', 'Run at')}
                    active={sort.key === 'run_at'}
                    direction={sort.dir === 1 ? 'asc' : 'desc'}
                    onSort={() => toggleSort('run_at')}
                    align="left"
                    baseStyle={thS}
                  />
                  <SortHeaderCell
                    label="Sharpe"
                    active={sort.key === 'sharpe_ratio'}
                    direction={sort.dir === 1 ? 'asc' : 'desc'}
                    onSort={() => toggleSort('sharpe_ratio')}
                    align="right"
                    baseStyle={thS}
                  />
                  <SortHeaderCell
                    label={L('リターン', 'Return')}
                    active={sort.key === 'total_return_pct'}
                    direction={sort.dir === 1 ? 'asc' : 'desc'}
                    onSort={() => toggleSort('total_return_pct')}
                    align="right"
                    baseStyle={thS}
                  />
                  <SortHeaderCell
                    label="Max DD"
                    active={sort.key === 'max_drawdown_pct'}
                    direction={sort.dir === 1 ? 'asc' : 'desc'}
                    onSort={() => toggleSort('max_drawdown_pct')}
                    align="right"
                    baseStyle={thS}
                  />
                  <SortHeaderCell
                    label={L('取引数', 'Trades')}
                    active={sort.key === 'total_trades'}
                    direction={sort.dir === 1 ? 'asc' : 'desc'}
                    onSort={() => toggleSort('total_trades')}
                    align="right"
                    baseStyle={thS}
                  />
                </tr>
              </thead>
              <tbody>
                {paged.map((r, i) => (
                  <tr key={r.run_id}>
                    <td style={{ ...tdS(i), textAlign: 'left' }}>
                      {r.strategy_id ? (
                        <Link
                          to={`/detail/${encodeURIComponent(r.strategy_id)}?run_id=${encodeURIComponent(r.run_id)}`}
                          style={{ color: 'var(--text)', fontWeight: 600, textDecoration: 'none' }}
                        >
                          {r.strategy_id}
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--text3)' }}>—</span>
                      )}
                      <span style={{ color: 'var(--text3)', fontSize: 12, marginLeft: 8 }}>{r.run_id}</span>
                    </td>
                    <td style={{ ...tdS(i), textAlign: 'left', color: 'var(--text2)' }}>{r.symbol ?? '—'}</td>
                    <td style={{ ...tdS(i), textAlign: 'left', color: 'var(--text2)' }}>{fmtDate(r.run_at)}</td>
                    <td style={{ ...tdS(i), textAlign: 'right', color: 'var(--text)', fontWeight: 600 }}>
                      {fmtNumber(r.sharpe_ratio, { decimals: 2 })}
                    </td>
                    <td
                      style={{
                        ...tdS(i),
                        textAlign: 'right',
                        color:
                          r.total_return_pct == null
                            ? 'var(--text3)'
                            : r.total_return_pct >= 0
                              ? 'var(--success)'
                              : 'var(--danger)',
                      }}
                    >
                      {fmtNumber(r.total_return_pct, { decimals: 1, suffix: '%' })}
                    </td>
                    <td style={{ ...tdS(i), textAlign: 'right', color: r.max_drawdown_pct == null ? 'var(--text3)' : 'var(--danger)' }}>
                      {fmtNumber(r.max_drawdown_pct, { decimals: 1, suffix: '%' })}
                    </td>
                    <td style={{ ...tdS(i), textAlign: 'right', color: 'var(--text2)' }}>
                      {r.total_trades ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', marginTop: 'var(--space-3)' }}>
              <button
                aria-label={L('前のページ', 'Previous page')}
                onClick={() => setPage(Math.max(0, safePage - 1))}
                disabled={safePage === 0}
                style={{ ...inputS, cursor: safePage === 0 ? 'default' : 'pointer' }}
              >
                ←
              </button>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text3)' }}>
                {safePage + 1} / {totalPages}
              </span>
              <button
                aria-label={L('次のページ', 'Next page')}
                onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
                disabled={safePage === totalPages - 1}
                style={{ ...inputS, cursor: safePage === totalPages - 1 ? 'default' : 'pointer' }}
              >
                →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
