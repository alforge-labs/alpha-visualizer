import { test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clearViewerSettings, gotoDetail } from '../helpers/locators'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * issue #180 lightweight-charts PoC 用スクリーンショット撮影。
 * `?tv=1` クエリで feature flag を有効化し、TV モードの BacktestScreen を撮る。
 *
 * 出力先: <repo-root>/docs/screenshots/{ja,en}/backtest-tv.png
 */

const STRATEGY_ID = 'sma_cross'
const SCREENSHOT_DIR = resolve(__dirname, '../../../docs/screenshots')

async function ensureDir(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
}

test.describe.serial('lightweight-charts (TV) 用スクリーンショット', () => {
  for (const lang of ['ja', 'en'] as const) {
    test(`backtest-tv (${lang})`, async ({ page }) => {
      await clearViewerSettings(page)
      const suffix = `?tv=1${lang === 'en' ? '&lang=en' : ''}`
      await page.goto(`/detail/${STRATEGY_ID}${suffix}`)
      await page.waitForLoadState('networkidle')
      // renderer-mode バッジで TV β レンダラを確認
      await page.getByTestId('renderer-mode').waitFor({ state: 'visible' })
      // チャートコンテナの aria-label を待つ
      await page.locator('[data-testid="backtest-equity-chart-tv"]').waitFor()
      const out = resolve(SCREENSHOT_DIR, lang, 'backtest-tv.png')
      await ensureDir(out)
      await page.screenshot({ path: out })
    })
  }

  test('backtest-tv (ja, gotoDetail helper)', async ({ page }) => {
    // gotoDetail を経由しても feature flag が ON のまま維持されることの回帰確認。
    // renderer-mode バッジは issue #231 以降 ?tv クエリ無しの本番ビルドでは
    // 表示されないため、TV チャート本体の testid で検証する。
    await clearViewerSettings(page)
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('alpha.flags.lightweightCharts', '1')
      } catch {
        /* ignore */
      }
    })
    await gotoDetail(page, STRATEGY_ID)
    await page.waitForLoadState('networkidle')
    await page.locator('[data-testid="backtest-equity-chart-tv"]').waitFor({ state: 'visible' })
  })
})
