import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const API_PROXY_TARGET = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: API_PROXY_TARGET,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../src/alpha_visualizer/static',
    emptyOutDir: true,
    sourcemap: true,
    rolldownOptions: {
      output: {
        // 大きい / 安定した依存を別 chunk にして長期キャッシュを効かせる。
        // 各 Page が visx を共通利用するため、visx を切り出すと page chunk
        // が小さくなり追加 fetch も dedupe される。
        // issue #180: lightweight-charts / fancy-canvas は `tv` chunk に分離して
        // size-limit のサイズ gate を効かせる。
        // issue #187: deprecated な advancedChunks から codeSplitting へ移行。
        codeSplitting: {
          groups: [
            {
              name: 'tv',
              test: /[\\/]node_modules[\\/](?:\.pnpm[\\/])?(?:lightweight-charts|fancy-canvas)/,
            },
            {
              name: 'visx',
              test: /[\\/]node_modules[\\/](?:\.pnpm[\\/])?(?:@visx[+/]|d3-)/,
            },
            {
              name: 'react-router',
              test: /[\\/]node_modules[\\/](?:\.pnpm[\\/])?(?:react-router-dom|@remix-run)/,
            },
            {
              name: 'react',
              test: /[\\/]node_modules[\\/](?:\.pnpm[\\/])?(?:react|react-dom|scheduler)@/,
            },
            {
              name: 'fonts',
              test: /[\\/]node_modules[\\/](?:\.pnpm[\\/])?@fontsource/,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
