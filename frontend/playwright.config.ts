import { defineConfig, devices } from '@playwright/test'

const PORT = 8123
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e/specs',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
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
    // FORGE_CONFIG が外部 forge.yaml を指しているとフィクスチャが上書きされるので明示クリア。
    // --forge-config も併せて明示することで二重に保護する。
    command:
      'env FORGE_CONFIG= uv run alpha-vis serve --forge-dir frontend/e2e/fixtures/forge --forge-config frontend/e2e/fixtures/forge/forge.yaml --host 127.0.0.1 --port 8123 --no-open',
    url: `${BASE_URL}/health`,
    cwd: '..',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
