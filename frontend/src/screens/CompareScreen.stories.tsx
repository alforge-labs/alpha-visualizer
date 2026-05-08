import type { Meta, StoryObj } from '@storybook/react-vite'
import { MemoryRouter } from 'react-router-dom'
import { MOCK_STRATEGIES } from '../mock/btData'
import { CompareScreen } from './CompareScreen'

const meta = {
  title: 'Screens/CompareScreen',
  component: CompareScreen,
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
} satisfies Meta<typeof CompareScreen>

export default meta
type Story = StoryObj<typeof meta>

export const DefaultJa: Story = {
  args: { data: MOCK_STRATEGIES, lang: 'ja', symbol: 'AAPL' },
}

export const DefaultEn: Story = {
  args: { data: MOCK_STRATEGIES, lang: 'en', symbol: 'AAPL' },
}

export const SingleStrategy: Story = {
  args: {
    data: MOCK_STRATEGIES.slice(0, 1),
    lang: 'ja',
    symbol: 'AAPL',
  },
}
