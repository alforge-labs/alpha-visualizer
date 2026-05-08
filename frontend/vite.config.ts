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
    rollupOptions: {
      output: {
        // 大きい / 安定した依存を別 chunk にして長期キャッシュを効かせる。
        // 各 Page が visx を共通利用するため、visx を切り出すと page chunk
        // が小さくなり追加 fetch も dedupe される。
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('@visx/') || id.includes('d3-')) return 'visx'
            if (id.includes('react-router-dom') || id.includes('@remix-run/'))
              return 'react-router'
            if (id.includes('/react/') || id.includes('/react-dom/'))
              return 'react'
            if (id.includes('@fontsource')) return 'fonts'
            return 'vendor'
          }
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
