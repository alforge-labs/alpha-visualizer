import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { StrategyListItem } from '../../api/types'
import { COMPARE_MAX, type SortKey, type SortDir, type StrategyGroup } from '../../hooks/useStrategyList'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { Chip } from '../../design/primitives'
import { Sparkline } from '../../charts/visx/Sparkline'
import { useSparklineCache } from '../../hooks/useSparklineCache'
import { fmtNumber, fmtDate } from '../../lib/format'

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
  groups?: StrategyGroup[]   // 与えられたらグループモード、無ければ従来 items を 1 グループ扱い
}

const HOVER_DELAY_MS = 220
const COL_COUNT = 9

function sharpeTone(v: number | null | undefined): string {
  if (v == null) return 'var(--text3)'
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
  position: 'sticky',
  top: 0,
  zIndex: 2,
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
  /** 768px 以下で列を hidden にする等の utility class（issue #54） */
  className?: string
}

function SortTh({ col, label, align = 'right', width, sortKey, sortDir, onSort, className }: SortThProps) {
  const active = sortKey === col
  return (
    <th
      className={className}
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
      onClick={() => onSelect(s.strategy_id)}
      title={L('クリックでプレビュー', 'Click to preview')}
      style={{
        background: trBackground,
        borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'background var(--motion-fast)',
        cursor: 'pointer',
      }}
    >
      <td
        style={{ ...TD_BASE, textAlign: 'center', padding: '10px 4px', width: 36 }}
        onClick={(e) => e.stopPropagation()}
      >
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
        <Link
          to={`/detail/${s.strategy_id}`}
          title={L('フル詳細を開く', 'Open full detail')}
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'inline-block',
            fontFamily: 'var(--serif)',
            fontSize: '1.0625rem',
            fontWeight: 600,
            color: 'var(--text)',
            letterSpacing: '-0.005em',
            lineHeight: 1.2,
            textDecoration: 'none',
            transition: 'color var(--motion-fast)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text)' }}
        >
          {s.name}
        </Link>
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
        {fmtNumber(s.latest_sharpe, { decimals: 2 })}
      </td>
      <td
        style={{
          ...TD_BASE,
          color:
            s.latest_return_pct == null
              ? 'var(--text3)'
              : s.latest_return_pct >= 0
                ? 'var(--success)'
                : 'var(--danger)',
        }}
      >
        {fmtNumber(s.latest_return_pct, { suffix: '%', decimals: 1 })}
      </td>
      <td style={{ ...TD_BASE, color: s.latest_max_drawdown_pct == null ? 'var(--text3)' : 'var(--danger)' }}>
        {fmtNumber(s.latest_max_drawdown_pct, { suffix: '%', decimals: 1 })}
      </td>
      <td className="u-col-hide-md-down" style={{ ...TD_BASE, color: 'var(--text2)' }}>
        {fmtNumber(s.latest_profit_factor, { decimals: 2 })}
      </td>
      <td className="u-col-hide-md-down" style={{ ...TD_BASE, color: 'var(--text2)' }}>
        {fmtNumber(s.latest_win_rate_pct, { suffix: '%', decimals: 1 })}
      </td>
      <td
        className="u-col-hide-md-down"
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
        className="u-col-hide-md-down"
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
    </tr>
  )
}

interface GroupHeaderRowProps {
  group: StrategyGroup
  collapsed: boolean
  onToggle: (key: string) => void
  lang: Lang
}

function GroupHeaderRow({ group, collapsed, onToggle, lang }: GroupHeaderRowProps) {
  const L = makeL(lang)
  const { aggregate: agg } = group
  return (
    <tr
      onClick={() => onToggle(group.key)}
      style={{
        background: 'var(--surface-2)',
        cursor: 'pointer',
        borderTop: '1px solid var(--border)',
      }}
    >
      <td colSpan={2} style={{ ...TD_BASE, textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 14,
              fontFamily: 'var(--mono)',
              color: 'var(--text2)',
              transition: 'transform var(--motion-fast)',
              transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            }}
          >
            ▾
          </span>
          <span
            style={{
              fontFamily: 'var(--serif)',
              fontSize: '1.0625rem',
              fontWeight: 600,
              color: 'var(--text)',
              letterSpacing: '-0.005em',
            }}
          >
            {group.label}
          </span>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
              color: 'var(--text3)',
              letterSpacing: 'var(--tracking-mono)',
              textTransform: 'uppercase',
            }}
          >
            {L(`${agg.count}件`, `${agg.count} strategies`)}
          </span>
        </div>
      </td>
      <td
        style={{
          ...TD_BASE,
          color: sharpeTone(agg.bestSharpe),
          fontWeight: 700,
          borderBottom: '1px solid var(--border)',
        }}
        title={L('グループ内の最高 Sharpe', 'Best Sharpe in group')}
      >
        {fmtNumber(agg.bestSharpe, { decimals: 2 })}
      </td>
      <td style={{ ...TD_BASE, color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>—</td>
      <td
        style={{
          ...TD_BASE,
          color: agg.worstDrawdownPct == null ? 'var(--text3)' : 'var(--danger)',
          borderBottom: '1px solid var(--border)',
        }}
        title={L('グループ内の最悪 DD', 'Worst drawdown in group')}
      >
        {fmtNumber(agg.worstDrawdownPct, { suffix: '%', decimals: 1 })}
      </td>
      <td className="u-col-hide-md-down" style={{ ...TD_BASE, color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>—</td>
      <td className="u-col-hide-md-down" style={{ ...TD_BASE, color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>—</td>
      <td className="u-col-hide-md-down" style={{ ...TD_BASE, color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>—</td>
      <td className="u-col-hide-md-down" style={{ ...TD_BASE, borderBottom: '1px solid var(--border)' }}></td>
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
  groups,
}: Props): React.ReactElement {
  const L = makeL(lang)
  const sparkline = useSparklineCache()
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(() => new Set())

  // 行ホバーが HOVER_DELAY_MS 続いたら sparkline を fetch
  useEffect(() => {
    if (!hoveredId) return
    const timer = window.setTimeout(() => {
      sparkline.prefetch(hoveredId)
    }, HOVER_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [hoveredId, sparkline])

  // groups が指定された場合のみグループモード。グループ数が 1 以下なら見出し非表示。
  const renderGroups = useMemo<StrategyGroup[] | null>(() => {
    if (!groups) return null
    if (groups.length <= 1) return null   // 'none' は 1 グループ → 見出しをそもそも出さない
    return groups
  }, [groups])

  const toggleGroup = (key: string): void => {
    setCollapsedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const renderRow = (s: StrategyListItem): React.ReactElement => {
    const isSelected = selectedId === s.strategy_id
    const inCompare = compareIds.includes(s.strategy_id)
    const maxCompareReached = compareIds.length >= COMPARE_MAX && !inCompare
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
  }

  return (
    <div
      className="u-scroll-x"
      data-testid="strategy-table-scroll"
      style={{
        flex: 1,
        minWidth: 0,
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
            <SortTh col="latest_profit_factor" label="Profit F." className="u-col-hide-md-down" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortTh col="latest_win_rate_pct" label="Win %" className="u-col-hide-md-down" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortTh col="last_run_at" label={L('最終実行', 'Last run')} className="u-col-hide-md-down" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <th className="u-col-hide-md-down" style={{ ...TH_BASE, width: 132, textAlign: 'right' }}>
              {L('推移', 'Trend')}
            </th>
          </tr>
        </thead>
        <tbody>
          {renderGroups ? (
            renderGroups.flatMap(group => {
              const isCollapsed = collapsedKeys.has(group.key)
              const header = (
                <GroupHeaderRow
                  key={`__header__${group.key}`}
                  group={group}
                  collapsed={isCollapsed}
                  onToggle={toggleGroup}
                  lang={lang}
                />
              )
              if (isCollapsed) return [header]
              return [header, ...group.items.map(renderRow)]
            })
          ) : (
            items.map(renderRow)
          )}
          {items.length === 0 && (
            <tr>
              <td
                colSpan={COL_COUNT}
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
