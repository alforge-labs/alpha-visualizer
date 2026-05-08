import type { Meta, StoryObj } from '@storybook/react-vite'
import { Pill } from './Pill'

const meta = {
  title: 'Design Primitives/Pill',
  component: Pill,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: { onClick: () => {} },
} satisfies Meta<typeof Pill>

export default meta
type Story = StoryObj<typeof meta>

export const Inactive: Story = {
  args: { active: false, children: 'Browse' },
}

export const Active: Story = {
  args: { active: true, children: 'Browse' },
}
