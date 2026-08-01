import { useMemo, useState } from 'react'
import { ParentSize } from '@visx/responsive'
import { Group } from '@visx/group'
import { Bar } from '@visx/shape'
import { scaleBand, scaleLinear } from '@visx/scale'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { Trade } from '../../api/types'
import { useChartTheme } from '../../design/useChartTheme'
import { computeHoldingBins } from '../../lib/holdingPeriod'
import { ChartDataTable } from '../../design/primitives/ChartDataTable'
import { fmtNumber } from '../../lib/format'

interface Props {
  trades: Trade[]
  lang: Lang
  compact?: boolean
}

const MARGIN = { top: 16, right: 16, bottom: 32, left: 48 }

/**
 * 保有期間分布ヒストグラム（issue #372）。
 *
 * 「この戦略はスイングかポジションか」「想定外の塩漬けが混ざっていないか」を
 * 見る基本チャート。バーは勝ち（success）/ 負け（danger）で積み上げ、
 * ビン別の勝率・平均リターンはデータ表で提供する。
 */
export function HoldingPeriodChart(props: Props): React.ReactElement {
  return (
    <ParentSize>
      {({ width }) => (width > 0 ? <HoldingInner width={width} {...props} /> : null)}
    </ParentSize>
  )
}

function HoldingInner({
  width,
  trades,
  lang,
  compact = false,
}: Props & { width: number }): React.ReactElement {
  const theme = useChartTheme()
  const L = makeL(lang)
  const [hovIdx, setHovIdx] = useState<number | null>(null)

  const bins = useMemo(() => computeHoldingBins(trades), [trades])

  const height = compact ? 200 : 240
  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerH = Math.max(0, height - MARGIN.top - MARGIN.bottom)

  const maxCount = Math.max(...bins.map((b) => b.count), 1)

  const xScale = useMemo(
    () =>
      scaleBand<string>({
        domain: bins.map((b) => b.label),
        range: [0, innerW],
        padding: 0.32,
      }),
    [bins, innerW],
  )
  const yScale = useMemo(
    () => scaleLinear<number>({ domain: [0, maxCount], range: [innerH, 0], nice: true }),
    [maxCount, innerH],
  )

  if (bins.length === 0) {
    return (
      <p
        style={{
          margin: 0,
          fontFamily: 'var(--mono)',
          fontSize: 'var(--fs-mono-sm)',
          color: 'var(--text3)',
        }}
      >
        {L('データなし', 'No data')}
      </p>
    )
  }

  const hovered = hovIdx != null ? bins[hovIdx] : null

  return (
    <div>
      <figure
        aria-label={L(
          '保有期間分布ヒストグラム（勝ち/負けの積み上げ）',
          'Holding period distribution histogram (stacked wins/losses)',
        )}
        style={{ margin: 0 }}
      >
        <svg width={width} height={height} role="img" aria-hidden="true">
          <Group left={MARGIN.left} top={MARGIN.top}>
            {bins.map((b, i) => {
              const x = xScale(b.label) ?? 0
              const bw = xScale.bandwidth()
              const total = b.count
              const winH = total > 0 ? (innerH - yScale(total)) * (b.wins / total) : 0
              const lossH = total > 0 ? (innerH - yScale(total)) - winH : 0
              const yTop = yScale(total)
              return (
                <Group
                  key={b.label}
                  onMouseEnter={() => setHovIdx(i)}
                  onMouseLeave={() => setHovIdx(null)}
                >
                  {/* 負け（上段・danger）→ 勝ち（下段・success）の積み上げ */}
                  <Bar x={x} y={yTop} width={bw} height={lossH} fill={theme.danger} opacity={0.8} />
                  <Bar
                    x={x}
                    y={yTop + lossH}
                    width={bw}
                    height={winH}
                    fill={theme.success}
                    opacity={0.85}
                  />
                  <text
                    x={x + bw / 2}
                    y={innerH + 20}
                    textAnchor="middle"
                    fontSize={11}
                    fontFamily="var(--mono)"
                    fill="var(--text3)"
                  >
                    {b.label}
                  </text>
                  <text
                    x={x + bw / 2}
                    y={yTop - 4}
                    textAnchor="middle"
                    fontSize={11}
                    fontFamily="var(--mono)"
                    fill="var(--text3)"
                  >
                    {b.count}
                  </text>
                </Group>
              )
            })}
          </Group>
        </svg>
        {hovered && (
          <div
            style={{
              display: 'flex',
              gap: 12,
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
              color: 'var(--text2)',
            }}
          >
            <span>{hovered.label}</span>
            <span>
              {L(`${hovered.count} 件`, `${hovered.count} trades`)}
            </span>
            <span>
              {L('勝率', 'Win')} {fmtNumber(hovered.winRate, { decimals: 1, suffix: '%' })}
            </span>
            <span>
              {L('平均', 'Avg')} {fmtNumber(hovered.avgReturnPct, { decimals: 2, suffix: '%' })}
            </span>
          </div>
        )}
      </figure>
      <ChartDataTable
        label={L('データ表を表示', 'Show data table')}
        caption={L(
          '保有期間ビン別の取引件数・勝率・平均リターン',
          'Trade count, win rate, and average return per holding-period bin',
        )}
        columns={[
          L('保有期間', 'Holding'),
          L('件数', 'Count'),
          L('勝率', 'Win rate'),
          L('平均リターン', 'Avg return'),
        ]}
        rows={bins.map((b) => [
          b.label,
          b.count,
          fmtNumber(b.winRate, { decimals: 1, suffix: '%' }),
          fmtNumber(b.avgReturnPct, { decimals: 2, suffix: '%' }),
        ])}
      />
    </div>
  )
}
