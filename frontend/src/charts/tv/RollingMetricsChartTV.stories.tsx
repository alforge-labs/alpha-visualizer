import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, type ComponentType, type ReactElement } from 'react'

import { RollingMetricsChartTV } from './RollingMetricsChartTV'
import { DashboardProvider } from '../../contexts/DashboardContext'

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
      <DashboardProvider>
        <div style={{ padding: 32, width: 'min(100%, 960px)' }}>
          <Story />
        </div>
      </DashboardProvider>
    )
  }
}

function generateReturns(n: number, seed = 0.42): number[] {
  const out: number[] = []
  let x = seed
  for (let i = 0; i < n; i++) {
    x = (x * 9301 + 49297) % 233280
    out.push((x / 233280 - 0.5) * 0.03)
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

const meta: Meta<typeof RollingMetricsChartTV> = {
  title: 'Charts/TV/RollingMetricsChartTV',
  component: RollingMetricsChartTV,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
}
export default meta

type Story = StoryObj<typeof RollingMetricsChartTV>

const dailyReturns = generateReturns(500)
const dates = generateDates(500)

export const Atelier: Story = {
  decorators: [withVariation('atelier')],
  parameters: { backgrounds: { default: 'light' } },
  args: { dailyReturns, dates },
}

export const Lab: Story = {
  decorators: [withVariation('lab')],
  parameters: { backgrounds: { default: 'app-bg' } },
  args: { dailyReturns, dates },
}
