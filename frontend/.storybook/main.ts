import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  // Vite 設定はそのまま継承（vite.config.ts の path alias などを共有）
  viteFinal: async (vite) => {
    return vite
  },
}

export default config
