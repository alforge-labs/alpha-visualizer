import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, type ComponentType, type ReactElement } from 'react'

import { CompareEquityTV } from './CompareEquityTV'
import type { CompareEquityTVSeries } from './CompareEquityTV'

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
      <div style={{ padding: 32, width: 'min(100%, 1100px)' }}>
        <Story />
      </div>
    )
  }
}

function generateEquity(n: number, seed: number, vol: number): number[] {
  const out: number[] = [100]
  let x = seed
  for (let i = 1; i < n; i++) {
    x = (x * 9301 + 49297) % 233280
    const r = (x / 233280 - 0.5) * vol
    out.push((out[i - 1] ?? 100) * (1 + r))
  }
  return out
}

function generateDates(n: number): string[] {
  const out: string[] = []
  const today = new Date('2024-06-30')
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

const dates = generateDates(360)
const series: CompareEquityTVSeries[] = [
  {
    id: 'sma_cross',
    label: 'SMA Cross',
    values: generateEquity(360, 0.41, 0.022),
    dates,
    color: '#C25A2A',
    isBaseline: true,
  },
  {
    id: 'rsi_rev',
    label: 'RSI Reversal',
    values: generateEquity(360, 0.73, 0.018),
    dates,
    color: '#5B7A8C',
    isBaseline: false,
  },
  {
    id: 'momo_break',
    label: 'Momentum Breakout',
    values: generateEquity(360, 0.19, 0.026),
    dates,
    color: '#4F7A3F',
    isBaseline: false,
  },
]

const meta: Meta<typeof CompareEquityTV> = {
  title: 'Charts/TV/CompareEquityTV',
  component: CompareEquityTV,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
}
export default meta

type Story = StoryObj<typeof CompareEquityTV>

export const ThreeStrategies: Story = {
  decorators: [withVariation('atelier')],
  parameters: { backgrounds: { default: 'light' } },
  args: { lang: 'ja', series },
}

export const Lab: Story = {
  decorators: [withVariation('lab')],
  parameters: { backgrounds: { default: 'app-bg' } },
  args: { lang: 'ja', series },
}

export const Single: Story = {
  decorators: [withVariation('atelier')],
  parameters: { backgrounds: { default: 'light' } },
  args: { lang: 'ja', series: [series[0]!] },
}
