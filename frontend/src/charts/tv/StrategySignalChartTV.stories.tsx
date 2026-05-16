import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, type ComponentType, type ReactElement } from 'react'

import type { OhlcBar, Trade } from '../../api/types'
import { StrategySignalChartTV } from './StrategySignalChartTV'

const START = new Date('2024-01-02')

function generateBars(n: number, seed = 0.42, start = 400): OhlcBar[] {
  const bars: OhlcBar[] = []
  let x = seed
  let price = start
  for (let i = 0; i < n; i++) {
    const d = new Date(START)
    d.setDate(START.getDate() + i)
    // 土日スキップ
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
    x = (x * 9301 + 49297) % 233280
    const r = (x / 233280 - 0.5) * 0.03
    const open = price
    const close = open * (1 + r)
    const high = Math.max(open, close) * (1 + Math.abs((x / 233280 - 0.5) * 0.01))
    const low = Math.min(open, close) * (1 - Math.abs((x / 233280 - 0.5) * 0.01))
    bars.push({
      time: d.toISOString().slice(0, 10),
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: 1_000_000 + Math.round((x / 233280) * 2_000_000),
    })
    price = close
  }
  return bars
}

function round(v: number): number {
  return Math.round(v * 100) / 100
}

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 0,
    direction: 'long',
    entry_date: '2024-01-05',
    exit_date: '2024-01-12',
    entry_price: 402,
    exit_price: 410,
    sl_price: 395,
    tp_price: 415,
    return_pct: 2.0,
    pnl: 800,
    holding_days: 7,
    mae_pct: -1.0,
    mfe_pct: 3.0,
    ...overrides,
  }
}

/** Storybook 専用デコレータ: data-variation を切り替えて theme を変える。 */
function withVariation(variation: 'atelier' | 'lab') {
  return (Story: ComponentType): ReactElement => {
    useEffect(() => {
      const prev = document.documentElement.dataset.variation
      document.documentElement.dataset.variation = variation
      return () => {
        if (prev === undefined) delete document.documentElement.dataset.variation
        else document.documentElement.dataset.variation = prev
      }
    }, [])
    return (
      <div style={{ padding: 32, width: 'min(100%, 960px)' }}>
        <Story />
      </div>
    )
  }
}

const meta: Meta<typeof StrategySignalChartTV> = {
  title: 'Charts/TV/StrategySignalChartTV',
  component: StrategySignalChartTV,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof StrategySignalChartTV>

// ===== 1. AtelierClosedTrades =====

const closedBars = generateBars(60, 0.31)
const closedTrades: Trade[] = [
  makeTrade({ id: 1, direction: 'long', entry_date: '2024-01-09', exit_date: '2024-01-17', entry_price: closedBars[5]?.close ?? 400, exit_price: (closedBars[11]?.close ?? 405) * 1.02, return_pct: 2.5, pnl: 1100 }),
  makeTrade({ id: 2, direction: 'short', entry_date: '2024-01-22', exit_date: '2024-01-29', entry_price: closedBars[14]?.close ?? 408, exit_price: (closedBars[19]?.close ?? 406) * 0.98, return_pct: 1.8, pnl: 760 }),
  makeTrade({ id: 3, direction: 'long', entry_date: '2024-02-05', exit_date: '2024-02-12', entry_price: closedBars[24]?.close ?? 402, exit_price: (closedBars[29]?.close ?? 398) * 0.97, return_pct: -2.6, pnl: -1050 }),
  makeTrade({ id: 4, direction: 'short', entry_date: '2024-02-15', exit_date: '2024-02-22', entry_price: closedBars[32]?.close ?? 405, exit_price: (closedBars[37]?.close ?? 410) * 1.02, return_pct: -1.4, pnl: -580 }),
  makeTrade({ id: 5, direction: 'long', entry_date: '2024-02-26', exit_date: '2024-03-04', entry_price: closedBars[40]?.close ?? 412, exit_price: (closedBars[45]?.close ?? 420) * 1.01, return_pct: 3.1, pnl: 1240 }),
  makeTrade({ id: 6, direction: 'long', entry_date: '2024-03-07', exit_date: '2024-03-14', entry_price: closedBars[48]?.close ?? 418, exit_price: (closedBars[53]?.close ?? 425) * 1.005, return_pct: 1.2, pnl: 480 }),
  makeTrade({ id: 7, direction: 'short', entry_date: '2024-03-15', exit_date: '2024-03-21', entry_price: closedBars[55]?.close ?? 424, exit_price: (closedBars[58]?.close ?? 418) * 0.995, return_pct: 0.9, pnl: 360 }),
  makeTrade({ id: 8, direction: 'long', entry_date: '2024-03-22', exit_date: '2024-03-25', entry_price: closedBars[58]?.close ?? 420, exit_price: 423.5, return_pct: 0.8, pnl: 320 }),
]

export const AtelierClosedTrades: Story = {
  decorators: [withVariation('atelier')],
  args: { bars: closedBars, trades: closedTrades },
}

// ===== 2. LabOpenTrade =====

const openBars = generateBars(60, 0.55)
const openTrades: Trade[] = [
  makeTrade({ id: 1, direction: 'long', entry_date: '2024-01-09', exit_date: '2024-01-17', entry_price: 400, exit_price: 410, pnl: 500, return_pct: 2.5 }),
  makeTrade({ id: 2, direction: 'short', entry_date: '2024-01-22', exit_date: '2024-01-29', entry_price: 415, exit_price: 408, pnl: 350, return_pct: 1.7 }),
  makeTrade({ id: 3, direction: 'long', entry_date: '2024-02-05', exit_date: '2024-02-12', entry_price: 412, exit_price: 405, pnl: -350, return_pct: -1.7 }),
  makeTrade({ id: 4, direction: 'long', entry_date: '2024-02-20', exit_date: '2024-02-26', entry_price: 408, exit_price: 416, pnl: 400, return_pct: 2.0 }),
  makeTrade({ id: 5, direction: 'short', entry_date: '2024-03-04', exit_date: '2024-03-08', entry_price: 422, exit_price: 425, pnl: -150, return_pct: -0.7 }),
  // open trade（exit_price null）— focus される
  makeTrade({
    id: 99,
    direction: 'long',
    entry_date: '2024-03-15',
    exit_date: '',
    entry_price: 425,
    exit_price: null,
    sl_price: 418,
    tp_price: 440,
    pnl: 0,
    return_pct: 0,
  }),
]

export const LabOpenTrade: Story = {
  decorators: [withVariation('lab')],
  args: { bars: openBars, trades: openTrades },
}

// ===== 3. SLHit =====

const slHitBars = generateBars(40, 0.18)
const slHitTrades: Trade[] = [
  makeTrade({ id: 1, direction: 'long', entry_date: '2024-01-08', exit_date: '2024-01-15', entry_price: 400, exit_price: 408, pnl: 400, return_pct: 2.0 }),
  // last trade が SL hit
  makeTrade({
    id: 2,
    direction: 'long',
    entry_date: '2024-01-22',
    exit_date: '2024-01-26',
    entry_price: 405,
    exit_price: 396,  // sl_price 395 とほぼ一致
    sl_price: 395,
    tp_price: 420,
    pnl: -450,
    return_pct: -2.2,
  }),
]

export const SLHit: Story = {
  decorators: [withVariation('atelier')],
  args: { bars: slHitBars, trades: slHitTrades },
}

// ===== 4. TPHit =====

const tpHitBars = generateBars(40, 0.77)
const tpHitTrades: Trade[] = [
  makeTrade({ id: 1, direction: 'long', entry_date: '2024-01-08', exit_date: '2024-01-15', entry_price: 400, exit_price: 405, pnl: 250, return_pct: 1.2 }),
  // last trade が TP hit
  makeTrade({
    id: 2,
    direction: 'long',
    entry_date: '2024-01-22',
    exit_date: '2024-01-29',
    entry_price: 405,
    exit_price: 419.5,  // tp_price 420 とほぼ一致
    sl_price: 395,
    tp_price: 420,
    pnl: 725,
    return_pct: 3.6,
  }),
]

export const TPHit: Story = {
  decorators: [withVariation('lab')],
  args: { bars: tpHitBars, trades: tpHitTrades },
}

// ===== 5. DenseMarkers =====

const denseBars = generateBars(60, 0.93)
const denseTrades: Trade[] = Array.from({ length: 25 }, (_, i) => {
  const entryIdx = i * 2
  const exitIdx = entryIdx + 1 + (i % 2)
  const direction: 'long' | 'short' = i % 3 === 0 ? 'short' : 'long'
  const pnl = (i % 4 === 0 ? -1 : 1) * (200 + i * 30)
  const entryBar = denseBars[Math.min(entryIdx, denseBars.length - 1)]
  const exitBar = denseBars[Math.min(exitIdx, denseBars.length - 1)]
  return makeTrade({
    id: i,
    direction,
    entry_date: entryBar?.time ?? '2024-01-02',
    exit_date: exitBar?.time ?? '2024-01-03',
    entry_price: entryBar?.close ?? 400,
    exit_price: exitBar?.close ?? 401,
    sl_price: null,
    tp_price: null,
    pnl,
    return_pct: pnl / 100,
  })
})

export const DenseMarkers: Story = {
  decorators: [withVariation('atelier')],
  args: { bars: denseBars, trades: denseTrades },
}
