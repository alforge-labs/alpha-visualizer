import { defineConfig, devices } from '@playwright/test'

const PORT = 8124
const BASE_URL = `http://127.0.0.1:${PORT}`

/**
 * README / alforge-labs サイト掲載用スクリーンショット撮影専用 config。
 * 既存の e2e フィクスチャを流用して `vis serve` を自動起動し、
 * `e2e/screenshots/capture.spec.ts` から各画面を順次撮影する。
 *
 * 出力先: ../docs/screenshots/{ja,en}/<page>.png
 */
export default defineConfig({
  testDir: './e2e/screenshots',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], locale: 'ja-JP' },
    },
  ],
  webServer: {
    command:
      'env FORGE_CONFIG= uv run vis serve --forge-dir frontend/e2e/fixtures/forge --forge-config frontend/e2e/fixtures/forge/forge.yaml --host 127.0.0.1 --port 8124 --no-open',
    url: `${BASE_URL}/health`,
    cwd: '..',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
