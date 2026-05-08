import type { Meta, StoryObj } from '@storybook/react-vite'
import { Sparkline } from './Sparkline'

const meta = {
  title: 'Charts (Presentational)/Sparkline',
  component: Sparkline,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof Sparkline>

export default meta
type Story = StoryObj<typeof meta>

const upTrend = Array.from({ length: 60 }, (_, i) => 100 + i * 0.8 + Math.sin(i / 4) * 3)
const downTrend = upTrend.slice().reverse()
const flat = Array.from({ length: 60 }, () => 100 + (Math.random() - 0.5))

export const UpTrend: Story = {
  args: { values: upTrend, width: 240, height: 56 },
}

export const DownTrend: Story = {
  args: { values: downTrend, width: 240, height: 56 },
}

export const Flat: Story = {
  args: { values: flat, width: 240, height: 56 },
}

export const ExplicitColor: Story = {
  args: { values: upTrend, width: 240, height: 56, color: 'var(--accent)' },
}

export const Empty: Story = {
  args: { values: [], width: 240, height: 56 },
  parameters: {
    docs: { description: { story: 'values が空のときは null を返す（描画しない）。' } },
  },
}
