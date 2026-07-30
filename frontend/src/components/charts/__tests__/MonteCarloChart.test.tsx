import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { Trade } from '../../../api/types'
import { MonteCarloChart } from '../MonteCarloChart'

// jsdom では ParentSize の計測幅が 0 になり何も描画されないため固定幅を与える
vi.mock('@visx/responsive', () => ({
  ParentSize: ({
    children,
  }: {
    children: (size: { width: number; height: number }) => React.ReactNode
  }) => <>{children({ width: 600, height: 300 })}</>,
}))

/**
 * issue #363: モンテカルロの「中央値リターン +2000%」級の数字が全期間累積で
 * あることの明記がなく、初級者には荒唐無稽に見えるか過大な期待を生んでいた。
 * 前提説明（試算の趣旨・累積である旨・期間）と用語ツールチップを常設する。
 */
function makeTrades(): Trade[] {
  return Array.from({ length: 30 }, (_, i) => ({
    id: i + 1,
    direction: 'long',
    entry_date: `20${20 + Math.floor(i / 10)}-01-01`,
    exit_date: `20${20 + Math.floor(i / 10)}-02-01`,
    holding_days: 30,
    return_pct: i % 3 === 0 ? -1.5 : 2.0,
    pnl: 10,
    mae_pct: -1,
    mfe_pct: 3,
  })) as unknown as Trade[]
}

describe('MonteCarloChart context (issue #363)', () => {
  it('試算の趣旨説明とバックテスト全期間の累積である旨を表示する', () => {
    render(<MonteCarloChart trades={makeTrades()} lang="ja" compact={false} />)
    // 趣旨: 並び順の運不運によるブレの試算（予測ではない）
    expect(screen.getByText(/並び順/)).toBeInTheDocument()
    expect(screen.getByText(/予測ではありません/)).toBeInTheDocument()
    // リターンが全期間累積であること + 期間の年数
    expect(screen.getByText(/全期間.*累積/)).toBeInTheDocument()
    expect(screen.getByText(/約 [0-9.]+ 年/)).toBeInTheDocument()
  })

  it('統計用語（中央値・95%ile・損失確率）にツールチップを備える', () => {
    render(<MonteCarloChart trades={makeTrades()} lang="ja" compact={false} />)
    expect(
      screen.getByRole('button', { name: /中央値リターンの説明/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /最良 95%ile/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /損失確率の説明/ })).toBeInTheDocument()
  })
})
