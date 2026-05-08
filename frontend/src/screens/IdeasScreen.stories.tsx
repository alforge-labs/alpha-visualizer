import type { Meta, StoryObj } from '@storybook/react-vite'
import { MemoryRouter } from 'react-router-dom'
import type { IdeaItem } from '../api/types'
import { IdeasScreen } from './IdeasScreen'

const meta = {
  title: 'Screens/IdeasScreen',
  component: IdeasScreen,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof IdeasScreen>

export default meta
type Story = StoryObj<typeof meta>

const sampleIdeas: IdeaItem[] = [
  {
    idea_id: 'idea_001',
    title: 'モメンタム + ボラティリティブレイクアウト',
    description:
      '20 日 EMA と ATR を組み合わせ、ボラティリティ拡大時にトレンドフォローする。',
    status: 'in_progress',
    tags: ['momentum', 'breakout'],
    linked_strategies: ['mom_atr_v1', 'mom_atr_v2'],
    notes_history: ['初期検証で sharpe 1.5 達成'],
  },
  {
    idea_id: 'idea_002',
    title: 'RSI レンジ反転戦略',
    description: '弱いトレンドのときは RSI のオーバーシュートで逆張り。',
    status: 'tested',
    tags: ['mean-reversion', 'rsi'],
    linked_strategies: ['rsi_reversal'],
    linked_runs: [
      { strategy_id: 'rsi_reversal', run_id: 'r1', notes: 'OOS で大幅劣化' },
    ],
  },
  {
    idea_id: 'idea_003',
    title: 'Bollinger Squeeze',
    status: 'backlog',
    tags: ['squeeze', 'volatility'],
  },
  {
    idea_id: 'idea_004',
    title: 'Pairs trading (相関再帰)',
    status: 'archived',
    tags: ['pairs', 'mean-reversion'],
  },
]

const noopFn = () => {}

const baseArgs = {
  filtered: sampleIdeas,
  loading: false,
  allTags: ['momentum', 'breakout', 'mean-reversion', 'rsi', 'squeeze'],
  statusFilter: '',
  tagFilter: '',
  onStatusFilterChange: noopFn,
  onTagFilterChange: noopFn,
  onSetLang: noopFn,
  onSetTheme: noopFn,
}

export const DefaultJa: Story = {
  args: { ...baseArgs, lang: 'ja', theme: 'dark' },
}

export const DefaultEn: Story = {
  args: { ...baseArgs, lang: 'en', theme: 'dark' },
}

export const Loading: Story = {
  args: { ...baseArgs, loading: true, filtered: [], lang: 'ja', theme: 'dark' },
}

export const Empty: Story = {
  args: { ...baseArgs, filtered: [], lang: 'ja', theme: 'dark' },
}

export const FilteredEmpty: Story = {
  args: {
    ...baseArgs,
    filtered: [],
    statusFilter: 'in_progress',
    lang: 'ja',
    theme: 'dark',
  },
}
