import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, type ComponentType, type ReactElement } from 'react'

import { EquityDrawdownPaneTV } from './EquityDrawdownPaneTV'

const today = new Date('2024-06-30')

function generateDates(n: number): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

function generateEquity(n: number, seed = 0.42): number[] {
  const out: number[] = [100]
  let x = seed
  for (let i = 1; i < n; i++) {
    x = (x * 9301 + 49297) % 233280
    const r = (x / 233280 - 0.5) * 0.04
    out.push((out[i - 1] ?? 100) * (1 + r))
  }
  return out
}

function generateDrawdown(equity: number[]): number[] {
  let peak = equity[0] ?? 100
  return equity.map((v) => {
    if (v > peak) peak = v
    return ((v - peak) / peak) * 100
  })
}

/**
 * Storybook 専用デコレータ: `useChartTheme` が監視する `data-variation` 属性を切り替える。
 */
function withVariation(variation: 'atelier' | 'lab') {
  return (Story: ComponentType): ReactElement => {
    useEffect(() => {
      const prev = document.documentElement.dataset.variation
      document.documentElement.dataset.variation = variation
      return () => {
        if (prev === undefined) delete document.documentElement.dataset.variation
        else document.documentElement.dataset.variation = prev
      }
    }, [])
    return (
      <div style={{ padding: 32, width: 'min(100%, 960px)' }}>
        <Story />
      </div>
    )
  }
}

const meta: Meta<typeof EquityDrawdownPaneTV> = {
  title: 'Charts/TV/EquityDrawdownPaneTV',
  component: EquityDrawdownPaneTV,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof EquityDrawdownPaneTV>

const shortEquity = generateEquity(60, 0.31)
const shortDates = generateDates(60)
const shortDrawdown = generateDrawdown(shortEquity)

const longEquity = generateEquity(2000, 0.71)
const longDates = generateDates(2000)
const longDrawdown = generateDrawdown(longEquity)

export const AtelierShort: Story = {
  decorators: [withVariation('atelier')],
  parameters: { backgrounds: { default: 'light' } },
  args: {
    lang: 'ja',
    equity: shortEquity,
    dates: shortDates,
    drawdown: shortDrawdown,
    isCutoffIdx: 40,
  },
}

export const AtelierLong: Story = {
  decorators: [withVariation('atelier')],
  parameters: { backgrounds: { default: 'light' } },
  args: {
    lang: 'ja',
    equity: longEquity,
    dates: longDates,
    drawdown: longDrawdown,
    isCutoffIdx: 1500,
  },
}

export const LabShort: Story = {
  decorators: [withVariation('lab')],
  parameters: { backgrounds: { default: 'app-bg' } },
  args: {
    lang: 'ja',
    equity: shortEquity,
    dates: shortDates,
    drawdown: shortDrawdown,
    isCutoffIdx: 40,
  },
}

export const LabLong: Story = {
  decorators: [withVariation('lab')],
  parameters: { backgrounds: { default: 'app-bg' } },
  args: {
    lang: 'ja',
    equity: longEquity,
    dates: longDates,
    drawdown: longDrawdown,
    isCutoffIdx: 1500,
  },
}

export const WithBenchmarkAndCutoff: Story = {
  decorators: [withVariation('atelier')],
  parameters: { backgrounds: { default: 'light' } },
  args: {
    lang: 'ja',
    equity: shortEquity,
    dates: shortDates,
    drawdown: shortDrawdown,
    isCutoffIdx: 30,
    benchmark: shortEquity.map((v) => v * 0.98),
    showBenchmark: true,
  },
}

/** issue #317: レジーム背景バンド（#187 の visx 撤去で失われた表示の復元） */
export const WithRegimeBands: Story = {
  decorators: [withVariation('atelier')],
  parameters: { backgrounds: { default: 'light' } },
  args: {
    lang: 'ja',
    equity: shortEquity,
    dates: shortDates,
    drawdown: shortDrawdown,
    isCutoffIdx: 30,
    showRegime: true,
    regimeSeries: {
      dates: shortDates,
      // 3 レジームが交互に現れる系列（バンド境界と色分けの確認用）
      states: shortDates.map((_, i) => (i < 20 ? 0 : i < 45 ? 1 : i < 70 ? 2 : 0)),
      n_states: 3,
      label_names: { '0': 'Range', '1': 'Bull', '2': 'Bear' },
    },
  },
}

/**
 * issue #317: palette（5 色）を超える state 数。
 * hsl フォールバック側にも alpha が載り、帯が不透明にならないことの確認用。
 */
export const WithManyRegimes: Story = {
  decorators: [withVariation('atelier')],
  parameters: { backgrounds: { default: 'light' } },
  args: {
    lang: 'ja',
    equity: shortEquity,
    dates: shortDates,
    drawdown: shortDrawdown,
    isCutoffIdx: 30,
    showRegime: true,
    regimeSeries: {
      dates: shortDates,
      states: shortDates.map((_, i) => Math.floor(i / 10) % 7),
      n_states: 7,
    },
  },
}
