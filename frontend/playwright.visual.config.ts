import { defineConfig, devices } from '@playwright/test'

/**
 * TV チャートのビジュアル回帰専用 config（issue #319）。
 *
 * 通常の E2E（`playwright.config.ts`）とは分離している:
 * - ベースライン画像は OS 依存のため、実行環境を CI（linux）に固定したい
 * - 失敗時の切り分けを機能テストと混ぜたくない
 *
 * ベースラインの生成手順は e2e/visual/README.md を参照。
 */
const PORT = 8125
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e/visual',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // 画像比較は再試行しても同じ結果になるため、リトライで時間を使わない
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-visual', open: 'never' }]],
  // ベースラインは OS 名でディレクトリを分ける（linux 用を CI で生成しコミットする）
  snapshotPathTemplate: '{testDir}/__snapshots__/{platform}/{arg}{ext}',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    // 画像差分を安定させるため、解像度・スケール・ロケールを固定する
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    locale: 'ja-JP',
    timezoneId: 'UTC',
    colorScheme: 'light',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      'env FORGE_CONFIG= uv run alpha-vis serve --forge-dir frontend/e2e/fixtures/forge --forge-config frontend/e2e/fixtures/forge/forge.yaml --host 127.0.0.1 --port 8125 --no-open',
    url: `${BASE_URL}/health`,
    cwd: '..',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
