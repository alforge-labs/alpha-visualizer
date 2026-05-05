import { useMemo } from 'react'
import { LinePath } from '@visx/shape'
import { scaleLinear } from '@visx/scale'
import { curveMonotoneX } from '@visx/curve'

interface SparklineProps {
  values: number[]
  width: number
  height: number
  color?: string
  strokeWidth?: number
}

/**
 * 軽量 sparkline。軸・グリッド・tooltip は持たない（Browse の行ホバー用）
 */
export function Sparkline({
  values,
  width,
  height,
  color = 'var(--accent)',
  strokeWidth = 1.25,
}: SparklineProps): React.ReactElement | null {
  const points = useMemo(
    () => values.map((v, i) => ({ x: i, y: v })),
    [values],
  )

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, Math.max(1, points.length - 1)],
        range: [1, width - 1],
      }),
    [points.length, width],
  )

  const yScale = useMemo(() => {
    if (points.length === 0) return scaleLinear<number>({ domain: [0, 1], range: [height - 1, 1] })
    const ys = points.map(p => p.y)
    const min = Math.min(...ys)
    const max = Math.max(...ys)
    const pad = (max - min || 1) * 0.04
    return scaleLinear<number>({
      domain: [min - pad, max + pad],
      range: [height - 1, 1],
    })
  }, [points, height])

  if (points.length < 2) return null

  return (
    <svg width={width} height={height} aria-hidden style={{ display: 'block' }}>
      <LinePath
        data={points}
        x={(d) => xScale(d.x)}
        y={(d) => yScale(d.y)}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        curve={curveMonotoneX}
        fill="none"
      />
    </svg>
  )
}
