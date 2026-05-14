import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, type ComponentType, type ReactElement } from 'react'

import { WFOEquityTV } from './WFOEquityTV'
import type { WFOWindow } from '../../api/types'

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

function generateEquity(n: number): number[] {
  const out: number[] = [100]
  let x = 0.42
  for (let i = 1; i < n; i++) {
    x = (x * 9301 + 49297) % 233280
    out.push((out[i - 1] ?? 100) * (1 + (x / 233280 - 0.5) * 0.024))
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

const dates = generateDates(300)
const equity = generateEquity(300)

const windows: WFOWindow[] = [
  {
    id: 0,
    label: 'W1',
    is_start: dates[0]!,
    is_end: dates[40]!,
    oos_start: dates[40]!,
    oos_end: dates[100]!,
    oos_return: 6.8,
    oos_sharpe: 1.5,
    is_sharpe: 1.7,
    params: {},
  } as WFOWindow,
  {
    id: 1,
    label: 'W2',
    is_start: dates[60]!,
    is_end: dates[100]!,
    oos_start: dates[100]!,
    oos_end: dates[160]!,
    oos_return: -2.4,
    oos_sharpe: -0.4,
    is_sharpe: 0.9,
    params: {},
  } as WFOWindow,
  {
    id: 2,
    label: 'W3',
    is_start: dates[120]!,
    is_end: dates[160]!,
    oos_start: dates[160]!,
    oos_end: dates[220]!,
    oos_return: 3.1,
    oos_sharpe: 1.1,
    is_sharpe: 1.0,
    params: {},
  } as WFOWindow,
]

const meta: Meta<typeof WFOEquityTV> = {
  title: 'Charts/TV/WFOEquityTV',
  component: WFOEquityTV,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
}
export default meta

type Story = StoryObj<typeof WFOEquityTV>

export const Atelier: Story = {
  decorators: [withVariation('atelier')],
  parameters: { backgrounds: { default: 'light' } },
  args: { composite_equity: equity, composite_dates: dates, windows },
}

export const Lab: Story = {
  decorators: [withVariation('lab')],
  parameters: { backgrounds: { default: 'app-bg' } },
  args: { composite_equity: equity, composite_dates: dates, windows },
}
