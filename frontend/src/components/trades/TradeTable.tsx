import { useMemo, useState } from 'react'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { Trade } from '../../api/types'
import { buildTradesCsv, downloadCsv } from '../../lib/csv'
import { fmtNumber } from '../../lib/format'
import { SortHeaderCell } from '../../design/primitives/SortHeaderCell'

type SortKey =
  | 'id'
  | 'direction'
  | 'entry_date'
  | 'exit_date'
  | 'holding_days'
  | 'return_pct'
  | 'pnl'
  | 'mae_pct'
  | 'mfe_pct'

interface Col {
  key: SortKey
  label: string
  w: number
  suffix?: string
  color?: boolean
  align: 'left' | 'right'
}

interface TradeTableProps {
  trades: Trade[]
  lang: Lang
}

const PAGE_SIZES = [15, 50, 100] as const

type DirFilter = 'all' | 'long' | 'short'
type ResultFilter = 'all' | 'win' | 'loss'

export function TradeTable({ trades, lang }: TradeTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'id', dir: 1 })
  const [page, setPage] = useState(0)
  // issue #371: 方向・勝敗・期間フィルタとページサイズ選択
  const [dirFilter, setDirFilter] = useState<DirFilter>('all')
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0])
  const L = makeL(lang)

  const COLS: Col[] = [
    { key: 'id', label: '#', w: 40, align: 'left' },
    { key: 'direction', label: L('方向', 'Dir'), w: 50, align: 'left' },
    { key: 'entry_date', label: L('エントリー', 'Entry'), w: 90, align: 'left' },
    { key: 'exit_date', label: L('エグジット', 'Exit'), w: 90, align: 'left' },
    { key: 'holding_days', label: L('保有', 'Hold'), w: 50, suffix: 'd', align: 'right' },
    { key: 'return_pct', label: L('リターン', 'Return'), w: 80, suffix: '%', color: true, align: 'right' },
    { key: 'pnl', label: 'P&L', w: 70, color: true, align: 'right' },
    { key: 'mae_pct', label: 'MAE%', w: 65, align: 'right' },
    { key: 'mfe_pct', label: 'MFE%', w: 65, align: 'right' },
  ]

  const filtered = useMemo(
    () =>
      trades.filter((t) => {
        if (dirFilter !== 'all' && t.direction !== dirFilter) return false
        if (resultFilter === 'win' && !(t.pnl > 0)) return false
        if (resultFilter === 'loss' && !(t.pnl <= 0)) return false
        if (dateFrom && t.entry_date < dateFrom) return false
        if (dateTo && t.entry_date > dateTo) return false
        return true
      }),
    [trades, dirFilter, resultFilter, dateFrom, dateTo],
  )
  // issue #371: 毎レンダー全件再計算していたソートを useMemo 化
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sort.key]
      const bv = b[sort.key]
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * sort.dir
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sort.dir
      return 0
    })
  }, [filtered, sort])
  const totalPages = Math.ceil(sorted.length / pageSize) || 1
  // フィルタ変更でページ数が減っても空ページに取り残されないよう clamp する
  const safePage = Math.min(page, totalPages - 1)
  const paged = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize)

  const toggle = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : 1 }))

  const thS: React.CSSProperties = {
    fontFamily: 'var(--mono)',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text3)',
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    padding: '7px 10px',
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  }

  const tdS = (i: number): React.CSSProperties => ({
    padding: '8px 10px',
    borderBottom: '1px solid var(--border)',
    background: i % 2 === 0 ? 'transparent' : 'var(--surface-2)',
  })

  const exportBtnS: React.CSSProperties = {
    height: 28,
    padding: '0 10px',
    borderRadius: 4,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    cursor: 'pointer',
    fontFamily: 'var(--mono)',
    fontSize: 12,
    color: 'var(--text2)',
    letterSpacing: '0.05em',
  }

  const chipS = (active: boolean): React.CSSProperties => ({
    padding: '3px 10px',
    background: active ? 'var(--accent-bg)' : 'transparent',
    border: `1px solid ${active ? 'var(--accent-glow)' : 'var(--border)'}`,
    borderRadius: 'var(--radius-pill)',
    color: active ? 'var(--accent)' : 'var(--text2)',
    fontFamily: 'var(--mono)',
    fontSize: 'var(--fs-mono-sm)',
    fontWeight: 600,
    cursor: 'pointer',
  })

  const dateInputS: React.CSSProperties = {
    padding: '3px 6px',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text)',
    fontFamily: 'var(--mono)',
    fontSize: 'var(--fs-mono-sm)',
  }

  const resetPage = () => setPage(0)

  const dirChips: ReadonlyArray<readonly [DirFilter, string]> = [
    ['all', L('すべて', 'All')],
    ['long', L('ロング', 'Long')],
    ['short', L('ショート', 'Short')],
  ]
  const resultChips: ReadonlyArray<readonly [ResultFilter, string]> = [
    ['all', L('すべて', 'All')],
    ['win', L('勝ち', 'Wins')],
    ['loss', L('負け', 'Losses')],
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* issue #371: 方向・勝敗・期間フィルタ + ページサイズ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div role="group" aria-label={L('方向で絞り込み', 'Filter by direction')} style={{ display: 'flex', gap: 4 }}>
          {dirChips.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={dirFilter === value}
              style={chipS(dirFilter === value)}
              onClick={() => { setDirFilter(value); resetPage() }}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="group" aria-label={L('勝敗で絞り込み', 'Filter by result')} style={{ display: 'flex', gap: 4 }}>
          {resultChips.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={resultFilter === value}
              style={chipS(resultFilter === value)}
              onClick={() => { setResultFilter(value); resetPage() }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="date"
            aria-label={L('開始日', 'From date')}
            value={dateFrom}
            style={dateInputS}
            onChange={(e) => { setDateFrom(e.target.value); resetPage() }}
          />
          <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 12 }}>〜</span>
          <input
            type="date"
            aria-label={L('終了日', 'To date')}
            value={dateTo}
            style={dateInputS}
            onChange={(e) => { setDateTo(e.target.value); resetPage() }}
          />
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {filtered.length !== trades.length && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text3)' }}>
              {L(`${filtered.length} / ${trades.length} 件`, `${filtered.length} / ${trades.length} trades`)}
            </span>
          )}
          <select
            aria-label={L('ページサイズ', 'Page size')}
            value={pageSize}
            style={{ ...dateInputS, cursor: 'pointer' }}
            onChange={(e) => { setPageSize(Number(e.target.value)); resetPage() }}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {L(`${n} 件/ページ`, `${n} / page`)}
              </option>
            ))}
          </select>
          <button
            type="button"
            style={exportBtnS}
            onClick={() => downloadCsv('trades.csv', buildTradesCsv(trades))}
          >
            CSV
          </button>
        </div>
      </div>
      {/* issue #362: P&L・価格の通貨前提を明示する */}
      <p
        style={{
          margin: 0,
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-caption)',
          color: 'var(--text3)',
          textAlign: 'right',
        }}
      >
        {L('P&L・価格は口座通貨建て', 'P&L and prices are in account currency')}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
          <thead>
            <tr>
              {COLS.map((c) => (
                <SortHeaderCell
                  key={c.key}
                  label={c.label}
                  active={sort.key === c.key}
                  direction={sort.dir === 1 ? 'asc' : 'desc'}
                  onSort={() => toggle(c.key)}
                  align={c.align}
                  width={c.w}
                  baseStyle={thS}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((t, i) => (
              <tr key={t.id}>
                {COLS.map((c) => {
                  const v = t[c.key] as string | number
                  const isNum = typeof v === 'number'
                  const color = c.color
                    ? isNum && v > 0
                      ? 'var(--success)'
                      : isNum && v <= 0
                        ? 'var(--danger)'
                        : 'var(--text)'
                    : 'var(--text)'
                  // issue #266: 数値は SSoT（fmtNumber）経由で桁区切り。
                  // color 列のみ正の符号 '+' を付ける（sign オプション）。
                  // issue #359: 整数（# 列等）は「0.00」「1.00」にしない。
                  const display = isNum
                    ? fmtNumber(v, {
                        decimals: Number.isInteger(v)
                          ? 0
                          : Math.abs(v) >= 100
                            ? 1
                            : 2,
                        sign: Boolean(c.color),
                      })
                    : String(v ?? '—')
                  return (
                    <td key={c.key} style={{ ...tdS(i), textAlign: c.align }}>
                      {c.key === 'direction' ? (
                        <span
                          style={{
                            fontFamily: 'var(--mono)',
                            fontSize: 13,
                            fontWeight: 600,
                            color: v === 'long' ? 'var(--success)' : 'var(--warn)',
                            background:
                              v === 'long'
                                ? 'color-mix(in srgb, var(--success) 12%, transparent)'
                                : 'color-mix(in srgb, var(--warn) 14%, transparent)',
                            padding: '1px 6px',
                            borderRadius: 3,
                          }}
                        >
                          {String(v)}
                        </span>
                      ) : (
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 14, color }}>
                          {display}
                          {c.suffix ?? ''}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
          <button
            aria-label={L('前のページ', 'Previous page')}
            onClick={() => setPage(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
            style={{
              height: 28,
              padding: '0 10px',
              borderRadius: 4,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              cursor: safePage === 0 ? 'default' : 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 13,
              color: safePage === 0 ? 'var(--text3)' : 'var(--text2)',
            }}
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
            style={{
              height: 28,
              padding: '0 10px',
              borderRadius: 4,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              cursor: safePage === totalPages - 1 ? 'default' : 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 13,
              color: safePage === totalPages - 1 ? 'var(--text3)' : 'var(--text2)',
            }}
          >
            →
          </button>
        </div>
      )}
    </div>
  )
}
