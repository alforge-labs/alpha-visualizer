import type { Preview } from '@storybook/react-vite'

// 本アプリの design tokens / fonts を Storybook でも有効にする。
// （main.tsx と同じセットを Storybook UI 上に注入する）
import '@fontsource/source-serif-4/latin-600.css'
import '@fontsource/inter-tight/latin-400.css'
import '@fontsource/inter-tight/latin-500.css'
import '@fontsource/inter-tight/latin-600.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '../src/design/tokens.css'

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'app-bg',
      values: [
        { name: 'app-bg', value: 'var(--bg, #0f0f10)' },
        { name: 'light', value: '#ffffff' },
      ],
    },
    layout: 'fullscreen',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
}

export default preview
