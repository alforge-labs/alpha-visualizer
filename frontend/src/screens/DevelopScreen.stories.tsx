import type { Meta, StoryObj } from '@storybook/react-vite'
import { MemoryRouter } from 'react-router'
import type { AgentBackendsResponse } from '../api/types'
import { DevelopScreen } from './DevelopScreen'

const BOTH_AVAILABLE: AgentBackendsResponse = {
  enabled: true,
  backends: [
    { id: 'claude', available: true, version: '1.2.3' },
    { id: 'codex', available: true, version: '0.9.0' },
  ],
}

const NONE_AVAILABLE: AgentBackendsResponse = {
  enabled: true,
  backends: [
    { id: 'claude', available: false, version: null },
    { id: 'codex', available: false, version: null },
  ],
}

const meta = {
  title: 'Screens/DevelopScreen',
  component: DevelopScreen,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof DevelopScreen>

export default meta
type Story = StoryObj<typeof meta>

export const DefaultJa: Story = {
  args: {
    lang: 'ja',
    backends: BOTH_AVAILABLE,
    running: false,
    status: null,
    logLines: [],
    result: null,
    error: null,
    onStart: () => {},
    onCancel: () => {},
  },
}

export const DefaultEn: Story = {
  args: { ...DefaultJa.args, lang: 'en' },
}

export const LocalhostOnly: Story = {
  args: { ...DefaultJa.args, backends: { enabled: false, backends: [] } },
}

export const NotInstalled: Story = {
  args: { ...DefaultJa.args, backends: NONE_AVAILABLE },
}

export const Running: Story = {
  args: {
    ...DefaultJa.args,
    running: true,
    status: 'running',
    logLines: ['[claude] 目標を分析中…', '[claude] strategy.json を生成中…'],
  },
}

export const Succeeded: Story = {
  args: {
    ...DefaultJa.args,
    status: 'succeeded',
    result: { strategy_id: 'cl_hmm_bb_rsi_v1' },
  },
}

export const SucceededNoResult: Story = {
  args: {
    ...DefaultJa.args,
    status: 'succeeded',
    result: null,
  },
}

export const Failed: Story = {
  args: {
    ...DefaultJa.args,
    status: 'failed',
    error: 'agent プロセスが異常終了しました',
  },
}
