import type { Meta, StoryObj } from '@storybook/react-vite'
import { MemoryRouter } from 'react-router-dom'
import { MOCK_OPTIMIZE } from '../mock/btData'
import { OptimizeScreen } from './OptimizeScreen'

const meta = {
  title: 'Screens/OptimizeScreen',
  component: OptimizeScreen,
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
} satisfies Meta<typeof OptimizeScreen>

export default meta
type Story = StoryObj<typeof meta>

export const DefaultJa: Story = {
  args: { data: MOCK_OPTIMIZE, compact: false, lang: 'ja' },
}

export const DefaultEn: Story = {
  args: { data: MOCK_OPTIMIZE, compact: false, lang: 'en' },
}

export const NoTrials: Story = {
  args: {
    data: { ...MOCK_OPTIMIZE, trials: [] },
    compact: false,
    lang: 'ja',
  },
}
