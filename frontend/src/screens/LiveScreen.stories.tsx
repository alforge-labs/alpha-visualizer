import type { Meta, StoryObj } from '@storybook/react-vite'
import { MemoryRouter } from 'react-router-dom'
import type { LiveListItem } from '../api/types'
import { LiveScreen } from './LiveScreen'

const ITEMS: LiveListItem[] = [
  { strategy_id: 'beat_qqq_hedged_v1', has_summary: true, has_trades: false, kind: 'position' },
  { strategy_id: 'cl_hmm_bb_rsi_v1', has_summary: true, has_trades: true, kind: 'strategy' },
]

const meta = {
  title: 'Screens/LiveScreen',
  component: LiveScreen,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof LiveScreen>

export default meta
type Story = StoryObj<typeof meta>

// 詳細部（LiveTab）は API fetch を内包するため Storybook ではローディング表示のまま。
// 一覧・ヘッダ・空状態の視覚確認を目的とする。
export const DefaultJa: Story = {
  args: {
    items: ITEMS,
    loading: false,
    selectedId: 'beat_qqq_hedged_v1',
    onSelect: () => {},
    lang: 'ja',
    theme: 'dark',
    onSetLang: () => {},
    onSetTheme: () => {},
  },
}

export const DefaultEn: Story = {
  args: { ...DefaultJa.args, lang: 'en' },
}

export const Empty: Story = {
  args: { ...DefaultJa.args, items: [], selectedId: null },
}
