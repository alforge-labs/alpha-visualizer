import type { Meta, StoryObj } from '@storybook/react-vite'
import { MemoryRouter } from 'react-router-dom'
import { MOCK_WFO } from '../mock/btData'
import { WFOScreen } from './WFOScreen'

const meta = {
  title: 'Screens/WFOScreen',
  component: WFOScreen,
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
} satisfies Meta<typeof WFOScreen>

export default meta
type Story = StoryObj<typeof meta>

export const DefaultJa: Story = {
  args: { data: MOCK_WFO, compact: false, lang: 'ja' },
}

export const DefaultEn: Story = {
  args: { data: MOCK_WFO, compact: false, lang: 'en' },
}

export const Compact: Story = {
  args: { data: MOCK_WFO, compact: true, lang: 'ja' },
}

export const NoWindows: Story = {
  args: {
    data: { ...MOCK_WFO, windows: [], composite_equity: [], composite_dates: [] },
    compact: false,
    lang: 'ja',
  },
}

/** 非 sharpe 指標の WFT 結果（vis#303）: ラベルが Calmar に切り替わる */
export const GenericMetric: Story = {
  args: {
    data: { ...MOCK_WFO, metric_name: 'calmar_ratio' },
    compact: false,
    lang: 'ja',
  },
}
