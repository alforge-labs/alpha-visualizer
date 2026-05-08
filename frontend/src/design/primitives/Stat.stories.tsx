import type { Meta, StoryObj } from '@storybook/react-vite'
import { Stat } from './Stat'

const meta = {
  title: 'Design Primitives/Stat',
  component: Stat,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof Stat>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { label: 'Sharpe', value: '1.85', size: 'md' },
}

export const Hero: Story = {
  args: { label: 'Total Return', value: '+32.5%', size: 'xl', tone: 'positive' },
}

export const Negative: Story = {
  args: { label: 'Max DD', value: '−9.2%', tone: 'negative', size: 'lg' },
}

export const WithSubLabel: Story = {
  args: {
    label: 'CAGR',
    value: '12.4%',
    sub: 'annualized',
    size: 'lg',
    tone: 'accent',
  },
}

export const RightAligned: Story = {
  args: { label: 'PF', value: '2.1', align: 'right', size: 'md' },
}
