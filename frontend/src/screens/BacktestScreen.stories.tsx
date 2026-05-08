import type { Meta, StoryObj } from '@storybook/react-vite'
import { MemoryRouter } from 'react-router-dom'
import { MOCK_BACKTEST } from '../mock/btData'
import { BacktestScreen } from './BacktestScreen'

const meta = {
  title: 'Screens/BacktestScreen',
  component: BacktestScreen,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ padding: 'var(--space-6)' }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof BacktestScreen>

export default meta
type Story = StoryObj<typeof meta>

export const DefaultJa: Story = {
  args: { data: MOCK_BACKTEST, compact: false, lang: 'ja' },
}

export const DefaultEn: Story = {
  args: { data: MOCK_BACKTEST, compact: false, lang: 'en' },
}

export const Compact: Story = {
  args: { data: MOCK_BACKTEST, compact: true, lang: 'ja' },
}
