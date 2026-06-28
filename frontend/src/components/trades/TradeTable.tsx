import { useState } from 'react'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { Trade } from '../../api/types'
import { buildTradesCsv, downloadCsv } from '../../lib/csv'
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

const PAGE = 15

export function TradeTable({ trades, lang }: TradeTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'id', dir: 1 })
  const [page, setPage] = useState(0)
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

  const sorted = [...trades].sort((a, b) => {
    const av = a[sort.key]
    const bv = b[sort.key]
    if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * sort.dir
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sort.dir
    return 0
  })
  const paged = sorted.slice(page * PAGE, (page + 1) * PAGE)
  const totalPages = Math.ceil(sorted.length / PAGE) || 1

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          style={exportBtnS}
          onClick={() => downloadCsv('trades.csv', buildTradesCsv(trades))}
        >
          CSV
        </button>
      </div>
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
                  let display = isNum
                    ? Math.abs(v) >= 100
                      ? v.toFixed(1)
                      : v.toFixed(2)
                    : String(v ?? '—')
                  if (c.color && isNum && v > 0) display = `+${display}`
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
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{
              height: 28,
              padding: '0 10px',
              borderRadius: 4,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              cursor: page === 0 ? 'default' : 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 13,
              color: page === 0 ? 'var(--text3)' : 'var(--text2)',
            }}
          >
            ←
          </button>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text3)' }}>
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            style={{
              height: 28,
              padding: '0 10px',
              borderRadius: 4,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              cursor: page === totalPages - 1 ? 'default' : 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 13,
              color: page === totalPages - 1 ? 'var(--text3)' : 'var(--text2)',
            }}
          >
            →
          </button>
        </div>
      )}
    </div>
  )
}
