import { useMemo } from 'react'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { StrategyComparison } from '../../api/types'
import { Card } from '../../design/primitives'
import { CorrelationHeatmapV } from '../../charts/visx/CorrelationHeatmapV'
import type { CorrelationCellMeta } from '../../charts/visx/CorrelationHeatmapV'
import { correlationMatrix } from '../../lib/correlation'

interface CorrelationHeatmapProps {
  strategies: StrategyComparison[]
  lang: Lang
}

const SECTION_LABEL: React.CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: 'var(--fs-caption)',
  fontWeight: 500,
  color: 'var(--text3)',
  letterSpacing: 'var(--tracking-caption)',
  textTransform: 'uppercase',
  marginBottom: 'var(--space-3)',
}

/**
 * 戦略間の相関ヒートマップ。
 *
 * - 戦略数 < 2 のときは描画しない（ヒートマップは N≥2 で意味を持つ）
 * - daily_returns が無い戦略はスキップ
 * - 銘柄が異なる組合せはヒートマップ上では維持しつつ、ホバー / 注釈で警告
 */
export function CorrelationHeatmap({
  strategies,
  lang,
}: CorrelationHeatmapProps): React.ReactElement | null {
  const L = makeL(lang)

  const eligible = useMemo(
    () => strategies.filter(s => Array.isArray(s.daily_returns) && s.daily_returns.length >= 2),
    [strategies],
  )

  const matrix = useMemo(
    () => correlationMatrix(eligible.map(s => s.daily_returns!)),
    [eligible],
  )

  const meta = useMemo<CorrelationCellMeta[][]>(() => {
    const rows: CorrelationCellMeta[][] = []
    for (let i = 0; i < eligible.length; i++) {
      const row: CorrelationCellMeta[] = []
      for (let j = 0; j < eligible.length; j++) {
        const a = eligible[i]!.daily_returns!.length
        const b = eligible[j]!.daily_returns!.length
        row.push({
          overlap: Math.min(a, b),
          symbolsMatch: eligible[i]!.symbol === eligible[j]!.symbol,
        })
      }
      rows.push(row)
    }
    return rows
  }, [eligible])

  if (eligible.length < 2) return null

  const labels = eligible.map(s => s.name)
  const symbols = eligible.map(s => s.symbol)
  const hasMixedSymbols = symbols.some(s => s !== symbols[0])

  return (
    <Card>
      <div data-testid="correlation-heatmap-card" style={SECTION_LABEL}>
        {L('戦略間相関', 'Strategy correlation')}
      </div>

      <p
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 'var(--fs-mono-sm)',
          color: 'var(--text3)',
          margin: '0 0 var(--space-3)',
          letterSpacing: 'var(--tracking-mono)',
        }}
      >
        {L(
          'daily_returns ベースのピアソン相関。+1 に近いほど同じリスクを増やしている可能性。',
          'Pearson correlation based on daily_returns. Values near +1 imply duplicated risk.',
        )}
      </p>

      {hasMixedSymbols && (
        <p
          data-testid="mixed-symbols-warning"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            color: 'var(--warn)',
            margin: '0 0 var(--space-3)',
            letterSpacing: 'var(--tracking-mono)',
          }}
        >
          {L(
            '※ 銘柄が異なる組合せが含まれます（同期間の市場は別物です）',
            '※ Mix of symbols detected — different markets, same period.',
          )}
        </p>
      )}

      <CorrelationHeatmapV
        labels={labels}
        matrix={matrix}
        meta={meta}
        symbols={symbols}
        symbolMismatchLabel={L(' · 銘柄が異なる', ' · symbol mismatch')}
        dataTableLabel={L('データ表', 'Data table')}
      />
    </Card>
  )
}
