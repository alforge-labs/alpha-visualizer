import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { StrategyListItem } from '../../api/types'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { Chip } from '../../design/primitives'
import { Sparkline } from '../../charts/visx/Sparkline'
import { fmtNumber, fmtDate } from '../../lib/format'
import { effectiveSymbol } from '../../lib/recipes'
import { RUN_SOURCE_STRATEGY_FILE } from '../../constants/runSource'

// eslint-disable-next-line react-refresh/only-export-components
export function sharpeTone(v: number | null | undefined): string {
  if (v == null) return 'var(--text3)'
  if (v >= 1.5) return 'var(--success)'
  if (v >= 1.0) return 'var(--warn)'
  return 'var(--danger)'
}

/**
 * セルの共通スタイル。padding を 14px から 8px に詰め、名前・ID・チップを
 * 1 行に収めることで行高を 86px から 44px 前後にする。フォントサイズは
 * 可読性のため変えない。
 */
// eslint-disable-next-line react-refresh/only-export-components
export const TD_BASE: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-md)',
  padding: '8px 12px',
  textAlign: 'right',
  borderBottom: '1px solid var(--border)',
  letterSpacing: 'var(--tracking-mono)',
}

export interface StrategyRowProps {
  s: StrategyListItem
  selected: boolean
  inCompare: boolean
  maxCompareReached: boolean
  onSelect: (id: string) => void
  onToggleCompare: (id: string) => void
  onHover: (id: string | null) => void
  sparkValues: number[] | 'loading' | 'empty' | undefined
  lang: Lang
  /** レシピ展開時の子行として描画する（名前セルを字下げする） */
  indent?: boolean
}

export function StrategyRow({
  s,
  selected,
  inCompare,
  maxCompareReached,
  onSelect,
  onToggleCompare,
  onHover,
  sparkValues,
  lang,
  indent = false,
}: StrategyRowProps): React.ReactElement {
  const L = makeL(lang)
  const [isHovered, setHovered] = useState(false)
  const symbol = effectiveSymbol(s)

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
        style={{ ...TD_BASE, textAlign: 'center', padding: '6px 4px', width: 36 }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={inCompare}
          disabled={maxCompareReached}
          aria-label={L(`${s.name} を比較に追加`, `Add ${s.name} to compare`)}
          onChange={() => onToggleCompare(s.strategy_id)}
          style={{
            cursor: maxCompareReached ? 'not-allowed' : 'pointer',
            accentColor: 'var(--accent)',
          }}
        />
      </td>
      <td style={{ ...TD_BASE, textAlign: 'left', paddingLeft: indent ? 40 : 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Link
            to={`/detail/${s.strategy_id}`}
            title={s.name}
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
            {s.name}
          </Link>
          <span
            title={s.strategy_id}
            style={{
              flexShrink: 0,
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
              color: 'var(--text3)',
              letterSpacing: 'var(--tracking-mono)',
            }}
          >
            {s.strategy_id}
          </span>
          {symbol ? (
            <Chip>{symbol}</Chip>
          ) : (
            // 銘柄が effectiveSymbol でも判明しない場合のみ表示する。timeframe の
            // 有無は問わない（旧コードの `!symbol && !s.timeframe` は timeframe が
            // あると銘柄不明でもラベルが出ない不具合だった）。
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
          {s.timeframe ? <Chip>{s.timeframe}</Chip> : null}
        </div>
      </td>
      <td style={{ ...TD_BASE, color: sharpeTone(s.latest_sharpe), fontWeight: 700, fontSize: '1rem' }}>
        {fmtNumber(s.latest_sharpe, { decimals: 2 })}
        {s.latest_source === RUN_SOURCE_STRATEGY_FILE && (
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
        style={{ ...TD_BASE, color: 'var(--text3)', fontSize: 'var(--fs-mono-sm)', textAlign: 'right' }}
      >
        {fmtDate(s.last_run_at)}
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
