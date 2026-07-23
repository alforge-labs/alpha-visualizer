import { test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clearViewerSettings } from '../helpers/locators'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * issue #180 lightweight-charts PoC 用スクリーンショット撮影。
 * issue #187 で feature flag を撤去したため、TV レンダラは常時有効。
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
      const suffix = lang === 'en' ? '?lang=en' : ''
      await page.goto(`/detail/${STRATEGY_ID}${suffix}`)
      await page.waitForLoadState('networkidle')
      // チャートコンテナの aria-label を待つ
      await page.locator('[data-testid="backtest-equity-chart-tv"]').waitFor()
      const out = resolve(SCREENSHOT_DIR, lang, 'backtest-tv.png')
      await ensureDir(out)
      await page.screenshot({ path: out })
    })
  }
})
