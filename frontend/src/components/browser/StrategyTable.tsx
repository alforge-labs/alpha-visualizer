import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { StrategyListItem } from '../../api/types'
import type { SortKey, SortDir } from '../../hooks/useStrategyList'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { Chip } from '../../design/primitives'
import { Sparkline } from '../../charts/visx/Sparkline'
import { useSparklineCache } from '../../hooks/useSparklineCache'

interface Props {
  items: StrategyListItem[]
  total: number
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  selectedId: string | null
  onSelect: (id: string) => void
  compareIds: string[]
  onToggleCompare: (id: string) => void
  lang: Lang
}

const HOVER_DELAY_MS = 220

function fmt(v: number | null, suffix = '', decimals = 2): string {
  if (v === null) return '—'
  return `${v.toFixed(decimals)}${suffix}`
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return s.slice(0, 10)
}

function sharpeTone(v: number | null): string {
  if (v === null) return 'var(--text3)'
  if (v >= 1.5) return 'var(--success)'
  if (v >= 1.0) return 'var(--warn)'
  return 'var(--danger)'
}

const TH_BASE: CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: 'var(--fs-caption)',
  fontWeight: 500,
  color: 'var(--text3)',
  letterSpacing: 'var(--tracking-caption)',
  textTransform: 'uppercase',
  padding: '14px 12px',
  textAlign: 'right',
  cursor: 'pointer',
  background: 'var(--surface)',
  borderBottom: '1px solid var(--border)',
  userSelect: 'none',
  whiteSpace: 'nowrap',
}

const TD_BASE: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-md)',
  padding: '14px 12px',
  textAlign: 'right',
  borderBottom: '1px solid var(--border)',
  letterSpacing: 'var(--tracking-mono)',
}

interface SortThProps {
  col: SortKey
  label: string
  align?: 'left' | 'right' | 'center'
  width?: number | string
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
}

function SortTh({ col, label, align = 'right', width, sortKey, sortDir, onSort }: SortThProps) {
  const active = sortKey === col
  return (
    <th
      style={{
        ...TH_BASE,
        textAlign: align,
        color: active ? 'var(--text2)' : 'var(--text3)',
        width,
      }}
      onClick={() => onSort(col)}
    >
      {label}
      {active ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  )
}

interface RowProps extends Pick<Props, 'onSelect' | 'onToggleCompare' | 'lang'> {
  s: StrategyListItem
  selected: boolean
  inCompare: boolean
  maxCompareReached: boolean
  onHover: (id: string | null) => void
  sparkValues: number[] | 'loading' | 'empty' | undefined
}

function StrategyRow({
  s,
  selected,
  inCompare,
  maxCompareReached,
  onSelect,
  onToggleCompare,
  onHover,
  sparkValues,
  lang,
}: RowProps) {
  const L = makeL(lang)
  const [isHovered, setHovered] = useState(false)

  const handleEnter = (): void => {
    setHovered(true)
    onHover(s.strategy_id)
  }

  const handleLeave = (): void => {
    setHovered(false)
    onHover(null)
  }

  const trBackground = selected
    ? 'var(--accent-bg)'
    : isHovered
      ? 'var(--surface-2)'
      : 'transparent'

  const sparkRendered =
    Array.isArray(sparkValues) && sparkValues.length >= 2 ? (
      <Sparkline values={sparkValues} width={120} height={26} />
    ) : sparkValues === 'loading' ? (
      <div
        style={{
          width: 120,
          height: 26,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          fontFamily: 'var(--mono)',
          fontSize: 'var(--fs-mono-sm)',
          color: 'var(--text3)',
        }}
      >
        ···
      </div>
    ) : null

  return (
    <tr
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{
        background: trBackground,
        borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'background var(--motion-fast)',
      }}
    >
      <td style={{ ...TD_BASE, textAlign: 'center', padding: '10px 4px', width: 36 }}>
        <input
          type="checkbox"
          checked={inCompare}
          disabled={maxCompareReached}
          aria-label={L(
            `${s.name} を比較に追加`,
            `Add ${s.name} to compare`,
          )}
          onChange={() => onToggleCompare(s.strategy_id)}
          style={{
            cursor: maxCompareReached ? 'not-allowed' : 'pointer',
            accentColor: 'var(--accent)',
          }}
        />
      </td>
      <td style={{ ...TD_BASE, textAlign: 'left' }}>
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontSize: '1.0625rem',
            fontWeight: 600,
            color: 'var(--text)',
            letterSpacing: '-0.005em',
            lineHeight: 1.2,
          }}
        >
          {s.name}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {s.symbol ? <Chip>{s.symbol}</Chip> : null}
          {s.timeframe ? <Chip>{s.timeframe}</Chip> : null}
          {!s.symbol && !s.timeframe && (
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-sm)',
                color: 'var(--text3)',
              }}
            >
              {L('未割当', 'unassigned')}
            </span>
          )}
        </div>
      </td>
      <td
        style={{
          ...TD_BASE,
          color: sharpeTone(s.latest_sharpe),
          fontWeight: 700,
          fontSize: '1rem',
        }}
      >
        {fmt(s.latest_sharpe, '', 2)}
      </td>
      <td
        style={{
          ...TD_BASE,
          color:
            s.latest_return_pct === null
              ? 'var(--text3)'
              : s.latest_return_pct >= 0
                ? 'var(--success)'
                : 'var(--danger)',
        }}
      >
        {fmt(s.latest_return_pct, '%', 1)}
      </td>
      <td style={{ ...TD_BASE, color: s.latest_max_drawdown_pct === null ? 'var(--text3)' : 'var(--danger)' }}>
        {fmt(s.latest_max_drawdown_pct, '%', 1)}
      </td>
      <td style={{ ...TD_BASE, color: 'var(--text2)' }}>
        {fmt(s.latest_profit_factor, '', 2)}
      </td>
      <td style={{ ...TD_BASE, color: 'var(--text2)' }}>
        {fmt(s.latest_win_rate_pct, '%', 1)}
      </td>
      <td
        style={{
          ...TD_BASE,
          color: 'var(--text3)',
          fontSize: 'var(--fs-mono-sm)',
          textAlign: 'right',
        }}
      >
        {fmtDate(s.last_run_at)}
      </td>
      <td
        style={{
          ...TD_BASE,
          padding: '10px 12px',
          width: 132,
          textAlign: 'right',
        }}
      >
        <div style={{ display: 'inline-flex', justifyContent: 'flex-end', minHeight: 26 }}>
          {sparkRendered}
        </div>
      </td>
      <td style={{ ...TD_BASE, textAlign: 'center', width: 40, padding: '10px 4px' }}>
        <button
          type="button"
          onClick={() => onSelect(s.strategy_id)}
          aria-label={L('プレビューを開く', 'Open preview')}
          title={L('プレビューを開く', 'Open preview')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: selected ? 'var(--accent)' : 'var(--text3)',
            fontSize: 16,
            padding: '2px 6px',
            transition: 'color var(--motion-fast)',
          }}
        >
          ›
        </button>
      </td>
    </tr>
  )
}

export function StrategyTable({
  items,
  total,
  sortKey,
  sortDir,
  onSort,
  selectedId,
  onSelect,
  compareIds,
  onToggleCompare,
  lang,
}: Props): React.ReactElement {
  const L = makeL(lang)
  const sparkline = useSparklineCache()
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // 行ホバーが HOVER_DELAY_MS 続いたら sparkline を fetch
  useEffect(() => {
    if (!hoveredId) return
    const timer = window.setTimeout(() => {
      sparkline.prefetch(hoveredId)
    }, HOVER_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [hoveredId, sparkline])

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        background: 'var(--bg)',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          minWidth: 1080,
        }}
      >
        <thead>
          <tr>
            <th style={{ ...TH_BASE, width: 36, padding: '14px 4px' }}></th>
            <th
              style={{ ...TH_BASE, textAlign: 'left', cursor: 'pointer' }}
              onClick={() => onSort('name')}
            >
              {L('戦略', 'Strategy')}
              {sortKey === 'name' ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
            </th>
            <SortTh col="latest_sharpe" label="Sharpe" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortTh col="latest_return_pct" label={L('リターン', 'Return')} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortTh col="latest_max_drawdown_pct" label="Max DD" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortTh col="latest_profit_factor" label="Profit F." sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortTh col="latest_win_rate_pct" label="Win %" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortTh col="last_run_at" label={L('最終実行', 'Last run')} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <th style={{ ...TH_BASE, width: 132, textAlign: 'right' }}>
              {L('推移', 'Trend')}
            </th>
            <th style={{ ...TH_BASE, width: 40, padding: '14px 4px' }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map(s => {
            const isSelected = selectedId === s.strategy_id
            const inCompare = compareIds.includes(s.strategy_id)
            const maxCompareReached = compareIds.length >= 6 && !inCompare
            return (
              <StrategyRow
                key={s.strategy_id}
                s={s}
                selected={isSelected}
                inCompare={inCompare}
                maxCompareReached={maxCompareReached}
                onSelect={onSelect}
                onToggleCompare={onToggleCompare}
                onHover={setHoveredId}
                sparkValues={sparkline.entries[s.strategy_id]}
                lang={lang}
              />
            )
          })}
          {items.length === 0 && (
            <tr>
              <td
                colSpan={10}
                style={{
                  ...TD_BASE,
                  textAlign: 'center',
                  padding: '48px 24px',
                  color: 'var(--text3)',
                  fontFamily: 'var(--mono)',
                  fontSize: 'var(--fs-mono-sm)',
                  letterSpacing: 'var(--tracking-mono)',
                }}
              >
                {L('該当する戦略はありません', 'No strategies match the current filters')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div
        style={{
          padding: '12px 24px',
          fontFamily: 'var(--mono)',
          fontSize: 'var(--fs-mono-sm)',
          color: 'var(--text3)',
          letterSpacing: 'var(--tracking-mono)',
          textTransform: 'uppercase',
          borderTop: '1px solid var(--border)',
        }}
      >
        {L(`${items.length}件 / 全${total}件`, `${items.length} of ${total} strategies`)}
      </div>
    </div>
  )
}
