import { useState } from 'react'
import { Link } from 'react-router'
import type { Recipe } from '../../lib/recipes'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { Chip } from '../../design/primitives'
import { Sparkline } from '../../charts/visx/Sparkline'
import { fmtNumber, fmtDate } from '../../lib/format'
import { COMPARE_MAX } from '../../hooks/useStrategyList'
import { TD_BASE, TD_DATE, sharpeTone } from './StrategyRow'
import { RUN_SOURCE_STRATEGY_FILE } from '../../constants/runSource'

export interface RecipeRowProps {
  recipe: Recipe
  expanded: boolean
  onToggleExpand: (key: string) => void
  selectedId: string | null
  onSelect: (id: string) => void
  compareIds: string[]
  onToggleCompare: (id: string) => void
  onHover: (id: string | null) => void
  sparkValues: number[] | 'loading' | 'empty' | undefined
  lang: Lang
}

export function RecipeRow({
  recipe,
  expanded,
  onToggleExpand,
  selectedId,
  onSelect,
  compareIds,
  onToggleCompare,
  onHover,
  sparkValues,
  lang,
}: RecipeRowProps): React.ReactElement {
  const L = makeL(lang)
  const [isHovered, setHovered] = useState(false)

  // 行に出す指標はすべて best 1 件から取る。列ごとに最大を取ると実在しない
  // 戦略の成績を合成表示することになる。
  const best = recipe.best
  // best が無いのは全 variant 未実行のときだけ（Recipe の不変条件）。
  // その場合の遷移先は先頭 variant にする。buildRecipes は 1 件以上の
  // bucket からしか Recipe を作らないため variants は必ず 1 件以上存在する
  // （lib/recipes.ts 参照）。noUncheckedIndexedAccess 下では `[0]` が
  // `undefined` を含む型になるが、`as` でもみ消さずこの不変条件を根拠に
  // 非 null 断定する。
  const target = best ?? recipe.variants[0]!
  const expandable = recipe.variantCount > 1
  const selected = best != null && selectedId === best.strategy_id
  const inCompare = best != null && compareIds.includes(best.strategy_id)
  const maxCompareReached = compareIds.length >= COMPARE_MAX && !inCompare

  const handleEnter = (): void => {
    setHovered(true)
    if (best) onHover(best.strategy_id)
  }

  const handleLeave = (): void => {
    setHovered(false)
    onHover(null)
  }

  const sparkRendered =
    Array.isArray(sparkValues) && sparkValues.length >= 2 ? (
      <Sparkline values={sparkValues} width={120} height={20} />
    ) : sparkValues === 'loading' ? (
      <div
        style={{
          width: 120,
          height: 20,
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
      onClick={() => { if (best) onSelect(best.strategy_id) }}
      title={L('クリックでプレビュー', 'Click to preview')}
      style={{
        background: selected ? 'var(--accent-bg)' : isHovered ? 'var(--surface-2)' : 'transparent',
        borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'background var(--motion-fast)',
        cursor: best ? 'pointer' : 'default',
      }}
    >
      <td
        style={{ ...TD_BASE, textAlign: 'center', padding: '6px 4px', width: 36 }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={inCompare}
          disabled={best == null || maxCompareReached}
          aria-label={L(`${recipe.name} の最良試行を比較に追加`, `Add the best trial of ${recipe.name} to compare`)}
          onChange={() => { if (best) onToggleCompare(best.strategy_id) }}
          style={{
            cursor: best == null || maxCompareReached ? 'not-allowed' : 'pointer',
            accentColor: 'var(--accent)',
          }}
        />
      </td>
      {/* issue #366: width:100% + maxWidth:0 で名前列が余白を吸収しつつ
          収まらない分は truncation。chips は狭幅で名前の下へ折り返す */}
      <td style={{ ...TD_BASE, textAlign: 'left', width: '100%', maxWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
          {expandable ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={
                expanded
                  ? L(`${recipe.name} の試行を畳む`, `Collapse trials of ${recipe.name}`)
                  : L(`${recipe.name} の試行を展開`, `Expand trials of ${recipe.name}`)
              }
              onClick={(e) => { e.stopPropagation(); onToggleExpand(recipe.key) }}
              style={{
                flexShrink: 0,
                width: 20,
                background: 'transparent',
                border: 'none',
                color: 'var(--text2)',
                fontFamily: 'var(--mono)',
                cursor: 'pointer',
                padding: 0,
                transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform var(--motion-fast)',
              }}
            >
              ▾
            </button>
          ) : (
            <span aria-hidden style={{ flexShrink: 0, width: 20 }} />
          )}
          <Link
            to={`/detail/${target.strategy_id}`}
            title={recipe.name}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: '0 1 auto',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
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
            {recipe.name}
          </Link>
          {recipe.symbol ? (
            <Chip>{recipe.symbol}</Chip>
          ) : (
            // 銘柄がどこからも判明しない場合のみ表示する。timeframe の有無は
            // 問わない（StrategyRow.tsx と同じ判定。Task 2 で潰した
            // 「未割当が出ない」不具合を RecipeRow でも踏襲する）。
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
          {recipe.timeframe ? <Chip>{recipe.timeframe}</Chip> : null}
          {expandable && (
            <span
              style={{
                flexShrink: 0,
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-sm)',
                color: 'var(--text3)',
                letterSpacing: 'var(--tracking-mono)',
              }}
            >
              {L(
                `${recipe.variantCount} 試行中 ${recipe.runCount} 件実行`,
                `${recipe.runCount} of ${recipe.variantCount} trials run`,
              )}
            </span>
          )}
        </div>
      </td>
      <td style={{ ...TD_BASE, color: sharpeTone(best?.latest_sharpe), fontWeight: 700, fontSize: '1rem' }}>
        {fmtNumber(best?.latest_sharpe, { decimals: 2 })}
        {best?.latest_source === RUN_SOURCE_STRATEGY_FILE && (
          <span
            data-testid="latest-source-badge"
            role="img"
            aria-label={L(
              '最新ランはチューニング試行（保存していないパラメータ）です',
              'Latest run is a tuning trial with unsaved parameters',
            )}
            title={L(
              '最新ランはチューニング試行（保存していないパラメータ）です',
              'Latest run is a tuning trial with unsaved parameters',
            )}
            style={{ marginLeft: 4, color: 'var(--warn)', fontSize: 10 }}
          >
            ⚠
          </span>
        )}
      </td>
      <td
        style={{
          ...TD_BASE,
          color:
            best?.latest_return_pct == null
              ? 'var(--text3)'
              : best.latest_return_pct >= 0
                ? 'var(--success)'
                : 'var(--danger)',
        }}
      >
        {fmtNumber(best?.latest_return_pct, { suffix: '%', decimals: 1 })}
      </td>
      <td className="u-col-hide-sm-down" style={{ ...TD_BASE, color: best?.latest_max_drawdown_pct == null ? 'var(--text3)' : 'var(--danger)' }}>
        {fmtNumber(best?.latest_max_drawdown_pct, { suffix: '%', decimals: 1 })}
      </td>
      <td className="u-col-hide-md-down" style={{ ...TD_BASE, color: 'var(--text2)' }}>
        {fmtNumber(best?.latest_profit_factor, { decimals: 2 })}
      </td>
      <td className="u-col-hide-md-down" style={{ ...TD_BASE, color: 'var(--text2)' }}>
        {fmtNumber(best?.latest_win_rate_pct, { suffix: '%', decimals: 1 })}
      </td>
      <td className="u-col-hide-md-down" style={TD_DATE}>
        {fmtDate(best?.last_run_at)}
      </td>
      <td
        className="u-col-hide-md-down"
        style={{ ...TD_BASE, padding: '6px 12px', width: 132, textAlign: 'right' }}
      >
        <div style={{ display: 'inline-flex', justifyContent: 'flex-end', minHeight: 20 }}>
          {sparkRendered}
        </div>
      </td>
    </tr>
  )
}
