import { defineConfig, devices } from '@playwright/test'

const PORT = 8124
const BASE_URL = `http://127.0.0.1:${PORT}`

/**
 * OSS 同梱サンプルデータ (samples/sample-forge) を見る場合の Playwright 設定。
 *
 * 既存の playwright.config.ts は frontend/e2e/fixtures/forge を見るのに対し、
 * こちらは samples/sample-forge を webServer の --forge-dir に渡す。
 *
 * 実行: `npm run e2e:samples`
 */
export default defineConfig({
  testDir: './e2e/samples',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-samples', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], locale: 'ja-JP' },
    },
  ],
  webServer: {
    // FORGE_CONFIG が外部 forge.yaml を指していないよう明示クリア。
    command:
      'env FORGE_CONFIG= uv run alpha-vis serve --forge-dir samples/sample-forge --forge-config samples/sample-forge/forge.yaml --host 127.0.0.1 --port 8124 --no-open',
    url: `${BASE_URL}/health`,
    cwd: '..',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
