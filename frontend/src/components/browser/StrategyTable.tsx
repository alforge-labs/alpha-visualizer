import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Recipe } from '../../lib/recipes'
import { COMPARE_MAX, type SortKey, type SortDir, type StrategyGroup } from '../../hooks/useStrategyList'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { SortHeaderCell } from '../../design/primitives/SortHeaderCell'
import { useSparklineCache } from '../../hooks/useSparklineCache'
import { fmtNumber } from '../../lib/format'
import { StrategyRow, TD_BASE, sharpeTone } from './StrategyRow'
import { RecipeRow } from './RecipeRow'

interface Props {
  recipes: Recipe[]
  /** 全戦略数。空状態の分岐（フィルタ由来 vs データ無し）に使う */
  strategyTotal: number
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  selectedId: string | null
  onSelect: (id: string) => void
  compareIds: string[]
  onToggleCompare: (id: string) => void
  lang: Lang
  groups?: StrategyGroup[]   // 与えられたらグループモード、無ければ従来 items を 1 グループ扱い
  /** フッタに出す件数（Task 4 で `StrategyTableFooter` が使う） */
  recipeTotal: number
  hiddenUnrunRecipeCount: number
}

const HOVER_DELAY_MS = 220
const COL_COUNT = 9

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
    <SortHeaderCell
      label={label}
      active={active}
      direction={sortDir}
      onSort={() => onSort(col)}
      align={align}
      width={width}
      className={className}
      baseStyle={{ ...TH_BASE, color: active ? 'var(--text2)' : 'var(--text3)' }}
    />
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
  recipes,
  strategyTotal,
  sortKey,
  sortDir,
  onSort,
  selectedId,
  onSelect,
  compareIds,
  onToggleCompare,
  lang,
  groups,
  recipeTotal,
  // hiddenUnrunRecipeCount は Task 4 の StrategyTableFooter が使う（このタスクでは未消費）
}: Props): React.ReactElement {
  const L = makeL(lang)
  const sparkline = useSparklineCache()
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(() => new Set())
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set())

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

  const toggleExpand = (key: string): void => {
    setExpandedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  /** レシピ 1 件を、折り畳み行＋（展開中なら）子行の配列にする。 */
  const renderRecipe = (recipe: Recipe): React.ReactElement[] => {
    const expanded = expandedKeys.has(recipe.key)
    const head = (
      <RecipeRow
        key={recipe.key}
        recipe={recipe}
        expanded={expanded}
        onToggleExpand={toggleExpand}
        selectedId={selectedId}
        onSelect={onSelect}
        compareIds={compareIds}
        onToggleCompare={onToggleCompare}
        onHover={setHoveredId}
        sparkValues={recipe.best ? sparkline.entries[recipe.best.strategy_id] : undefined}
        lang={lang}
      />
    )
    if (!expanded) return [head]
    const children = recipe.variants.map(v => {
      const inCompare = compareIds.includes(v.strategy_id)
      return (
        <StrategyRow
          key={v.strategy_id}
          s={v}
          selected={selectedId === v.strategy_id}
          inCompare={inCompare}
          maxCompareReached={compareIds.length >= COMPARE_MAX && !inCompare}
          onSelect={onSelect}
          onToggleCompare={onToggleCompare}
          onHover={setHoveredId}
          sparkValues={sparkline.entries[v.strategy_id]}
          lang={lang}
          indent
        />
      )
    })
    return [head, ...children]
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
            <th scope="col" style={{ ...TH_BASE, width: 36, padding: '14px 4px' }}>
              <span
                style={{
                  position: 'absolute',
                  width: 1,
                  height: 1,
                  padding: 0,
                  margin: -1,
                  overflow: 'hidden',
                  clip: 'rect(0 0 0 0)',
                  whiteSpace: 'nowrap',
                  border: 0,
                }}
              >
                {L('選択', 'Select')}
              </span>
            </th>
            <SortHeaderCell
              label={L('戦略', 'Strategy')}
              active={sortKey === 'name'}
              direction={sortDir}
              onSort={() => onSort('name')}
              align="left"
              baseStyle={{ ...TH_BASE, color: sortKey === 'name' ? 'var(--text2)' : 'var(--text3)' }}
            />
            <SortTh col="latest_sharpe" label="Sharpe" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortTh col="latest_return_pct" label={L('リターン', 'Return')} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortTh col="latest_max_drawdown_pct" label="Max DD" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortTh col="latest_profit_factor" label="Profit F." className="u-col-hide-md-down" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortTh col="latest_win_rate_pct" label="Win %" className="u-col-hide-md-down" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortTh col="last_run_at" label={L('最終実行', 'Last run')} className="u-col-hide-md-down" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <th scope="col" className="u-col-hide-md-down" style={{ ...TH_BASE, width: 132, textAlign: 'right' }}>
              {L('推移', 'Trend')}
            </th>
          </tr>
        </thead>
        <tbody>
          {renderGroups
            ? renderGroups.flatMap(group => {
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
                return [header, ...group.items.flatMap(renderRecipe)]
              })
            : recipes.flatMap(renderRecipe)}
          {recipes.length === 0 && (
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
                {strategyTotal > 0 ? (
                  L('該当する戦略はありません', 'No strategies match the current filters')
                ) : (
                  /* データが一切ない初回起動（forge 未導入の OSS ユーザーの
                     最初の接点）はデッドエンドにせず、次の一歩を提示する */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, lineHeight: 1.8 }}>
                    <div style={{ color: 'var(--text2)' }}>
                      {L('まだ戦略がありません', 'No strategies yet')}
                    </div>
                    <div>
                      {L('サンプルデータで試す: ', 'Try with bundled samples: ')}
                      <code
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                          padding: '2px 6px',
                        }}
                      >
                        alpha-vis serve --use-bundled-samples
                      </code>
                    </div>
                    <div>
                      <a
                        href="https://alforgelabs.com/?utm_source=alpha-visualizer&utm_medium=empty_state"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={L(
                          'AlphaForge で最初のバックテストを作る（別タブで開く）',
                          'Create your first backtest with AlphaForge (opens in new tab)',
                        )}
                        style={{ color: 'var(--accent)', textDecoration: 'none' }}
                      >
                        {L(
                          'AlphaForge で最初のバックテストを作る',
                          'Create your first backtest with AlphaForge',
                        )}
                        <span aria-hidden="true"> ↗</span>
                      </a>
                    </div>
                  </div>
                )}
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
          borderTop: '1px solid var(--border)',
        }}
      >
        {L(
          `${recipes.length} レシピ / 全 ${recipeTotal} レシピ`,
          `${recipes.length} of ${recipeTotal} recipes`,
        )}
      </div>
    </div>
  )
}
