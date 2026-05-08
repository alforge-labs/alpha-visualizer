import type { Meta, StoryObj } from '@storybook/react-vite'
import type { BacktestMetrics } from '../api/types'
import { MetricsSummaryBarV2 } from './MetricsSummaryBarV2'

const meta = {
  title: 'Components/MetricsSummaryBarV2',
  component: MetricsSummaryBarV2,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof MetricsSummaryBarV2>

export default meta
type Story = StoryObj<typeof meta>

const goodMetrics: BacktestMetrics = {
  total_return_pct: 32.5,
  cagr_pct: 12.4,
  sharpe_ratio: 1.85,
  sortino_ratio: 2.42,
  calmar_ratio: 1.32,
  max_drawdown_pct: -9.2,
  win_rate_pct: 62.5,
  profit_factor: 2.1,
  total_trades: 184,
  avg_holding_days: 4.2,
  var_95_pct: -1.5,
  cvar_95_pct: -2.3,
  annual_returns: { '2024': 32.5 },
}

const poorMetrics: BacktestMetrics = {
  total_return_pct: -8.5,
  cagr_pct: -3.0,
  sharpe_ratio: -0.4,
  sortino_ratio: -0.5,
  calmar_ratio: -0.2,
  max_drawdown_pct: -28.0,
  win_rate_pct: 38.0,
  profit_factor: 0.7,
  total_trades: 50,
  avg_holding_days: 6.8,
  annual_returns: { '2024': -8.5 },
}

export const Japanese: Story = {
  args: { metrics: goodMetrics, lang: 'ja' },
}

export const English: Story = {
  args: { metrics: goodMetrics, lang: 'en' },
}

export const Negative: Story = {
  args: { metrics: poorMetrics, lang: 'ja' },
}
