import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Recipe } from '../../lib/recipes'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { ASSET_CLASS_LABEL } from '../../lib/assetClass'
import { fmtNumber, fmtDate } from '../../lib/format'
import { SortHeaderCell } from '../../design/primitives/SortHeaderCell'
import { TD_BASE, sharpeTone } from './StrategyRow'
import {
  buildSymbolStats,
  sortSymbolStats,
  DEFAULT_SYMBOL_SORT_KEY,
  DEFAULT_SYMBOL_SORT_DIR,
  type SymbolStat,
  type SymbolSortKey,
  type SymbolSortDir,
} from '../../lib/symbolStats'

interface Props {
  /**
   * フィルタ前の全レシピ。絞り込むためのナビゲーションなので、
   * 絞り込み結果に応じて増減させてはならない。
   */
  recipes: Recipe[]
  lang: Lang
}

const TH_BASE: CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: 'var(--fs-caption)',
  fontWeight: 500,
  letterSpacing: 'var(--tracking-caption)',
  textTransform: 'uppercase',
  padding: '10px 12px',
  background: 'var(--surface)',
  borderBottom: '1px solid var(--border)',
  userSelect: 'none',
  whiteSpace: 'nowrap',
}

interface Column {
  key: SymbolSortKey
  ja: string
  en: string
  align: 'left' | 'right'
  /** 768px 以下で隠す列。未実行は本 SP2 の主目的なので対象にしない */
  hideMdDown?: boolean
}

const COLUMNS: readonly Column[] = [
  { key: 'symbol', ja: '銘柄', en: 'Symbol', align: 'left' },
  { key: 'assetClass', ja: '区分', en: 'Class', align: 'left', hideMdDown: true },
  { key: 'recipeCount', ja: 'レシピ', en: 'Recipes', align: 'right' },
  { key: 'runRecipeCount', ja: '実行済', en: 'Run', align: 'right' },
  { key: 'unrunRecipeCount', ja: '未実行', en: 'Unrun', align: 'right' },
  { key: 'bestSharpe', ja: '最高 Sharpe', en: 'Best Sharpe', align: 'right' },
  { key: 'avgReturnPct', ja: '平均 Return', en: 'Avg return', align: 'right', hideMdDown: true },
  { key: 'lastRunAt', ja: '最終実行', en: 'Last run', align: 'right', hideMdDown: true },
]

function returnTone(v: number | null): string {
  if (v == null) return 'var(--text3)'
  return v >= 0 ? 'var(--success)' : 'var(--danger)'
}

interface RowProps {
  stat: SymbolStat
  selected: boolean
  dimmed: boolean
  onToggle: (symbol: string) => void
  lang: Lang
}

function SymbolCoverageRow({ stat, selected, dimmed, onToggle, lang }: RowProps): React.ReactElement {
  const L = makeL(lang)
  const symbol = stat.symbol
  const label = symbol == null ? L('未割当', 'Unassigned') : symbol

  const handleToggle = (): void => {
    if (symbol == null) return
    onToggle(symbol)
  }

  return (
    <tr
      onClick={handleToggle}
      style={{
        background: selected ? 'var(--accent-bg)' : 'transparent',
        borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
        opacity: dimmed ? 0.55 : 1,
        cursor: symbol == null ? 'default' : 'pointer',
        transition: 'background var(--motion-fast)',
      }}
    >
      <td style={{ ...TD_BASE, textAlign: 'left' }}>
        <button
          type="button"
          aria-pressed={selected}
          disabled={symbol == null}
          // 行の onClick と二重発火するとトグルが打ち消し合うため伝播を止める
          onClick={(e) => { e.stopPropagation(); handleToggle() }}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            margin: 0,
            fontFamily: 'var(--serif)',
            fontSize: '1.0625rem',
            fontWeight: 600,
            color: symbol == null ? 'var(--text3)' : 'var(--text)',
            letterSpacing: '-0.005em',
            cursor: symbol == null ? 'default' : 'pointer',
          }}
        >
          {label}
        </button>
      </td>
      <td className="u-col-hide-md-down" style={{ ...TD_BASE, textAlign: 'left', color: 'var(--text3)' }}>
        {symbol == null ? '—' : ASSET_CLASS_LABEL[stat.assetClass][lang]}
      </td>
      <td style={{ ...TD_BASE, color: 'var(--text2)' }}>{stat.recipeCount}</td>
      <td style={{ ...TD_BASE, color: 'var(--text2)' }}>{stat.runRecipeCount}</td>
      <td
        style={{
          ...TD_BASE,
          color: stat.unrunRecipeCount > 0 ? 'var(--warn)' : 'var(--text3)',
          fontWeight: 700,
        }}
      >
        {stat.unrunRecipeCount}
      </td>
      <td style={{ ...TD_BASE, color: sharpeTone(stat.bestSharpe), fontWeight: 700 }}>
        {fmtNumber(stat.bestSharpe, { decimals: 2 })}
      </td>
      <td className="u-col-hide-md-down" style={{ ...TD_BASE, color: returnTone(stat.avgReturnPct) }}>
        {fmtNumber(stat.avgReturnPct, { suffix: '%', decimals: 1 })}
      </td>
      <td
        className="u-col-hide-md-down"
        style={{ ...TD_BASE, color: 'var(--text3)', fontSize: 'var(--fs-mono-sm)' }}
      >
        {fmtDate(stat.lastRunAt)}
      </td>
    </tr>
  )
}

/**
 * 銘柄カバレッジ表。
 *
 * 「どの銘柄に未実行レシピが溜まっているか」＝次に何を回すかに答える。
 * 並べ替えの state は URL に載せない。SavedViews が URL パラメータを保存する
 * 仕組みのため、載せると保存ビューに並び順まで混入する。
 */
export function SymbolCoverageTable({ recipes, lang }: Props): React.ReactElement | null {
  const L = makeL(lang)
  const [searchParams, setSearchParams] = useSearchParams()
  const [sortKey, setSortKey] = useState<SymbolSortKey>(DEFAULT_SYMBOL_SORT_KEY)
  const [sortDir, setSortDir] = useState<SymbolSortDir>(DEFAULT_SYMBOL_SORT_DIR)

  const stats = useMemo(() => buildSymbolStats(recipes), [recipes])
  const sorted = useMemo(() => sortSymbolStats(stats, sortKey, sortDir), [stats, sortKey, sortDir])

  const symbolFilter = useMemo(
    () => (searchParams.get('symbol') ?? '').split(',').filter(Boolean),
    [searchParams],
  )

  const toggleSymbol = (symbol: string): void => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      const current = next.get('symbol')?.split(',').filter(Boolean) ?? []
      const updated = current.includes(symbol)
        ? current.filter(v => v !== symbol)
        : [...current, symbol]
      if (updated.length) next.set('symbol', updated.join(','))
      else next.delete('symbol')
      return next
    }, { replace: true })
  }

  const handleSort = (key: SymbolSortKey): void => {
    if (key === sortKey) {
      setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
      return
    }
    setSortKey(key)
    setSortDir('desc')
  }

  if (sorted.length === 0) return null

  return (
    <section
      aria-label={L('銘柄カバレッジ', 'Symbol coverage')}
      style={{
        padding: 'var(--space-4) var(--space-7)',
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--serif)',
            fontSize: '1.25rem',
            fontWeight: 600,
            color: 'var(--text)',
            letterSpacing: '-0.005em',
          }}
        >
          {L('銘柄カバレッジ', 'Symbol coverage')}
        </h2>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            color: 'var(--text3)',
            letterSpacing: 'var(--tracking-mono)',
            textTransform: 'uppercase',
          }}
        >
          {L(
            `${sorted.length}銘柄 · ${recipes.length}レシピ`,
            `${sorted.length} symbols · ${recipes.length} recipes`,
          )}
        </span>
      </div>

      <div className="u-scroll-x" data-testid="symbol-coverage-scroll">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {COLUMNS.map(col => (
                <SortHeaderCell
                  key={col.key}
                  label={L(col.ja, col.en)}
                  active={sortKey === col.key}
                  direction={sortDir}
                  onSort={() => handleSort(col.key)}
                  align={col.align}
                  className={col.hideMdDown ? 'u-col-hide-md-down' : undefined}
                  baseStyle={{
                    ...TH_BASE,
                    color: sortKey === col.key ? 'var(--text2)' : 'var(--text3)',
                  }}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(stat => {
              const selected = stat.symbol != null && symbolFilter.includes(stat.symbol)
              return (
                <SymbolCoverageRow
                  key={stat.symbol ?? '__unassigned__'}
                  stat={stat}
                  selected={selected}
                  dimmed={symbolFilter.length > 0 && !selected}
                  onToggle={toggleSymbol}
                  lang={lang}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
