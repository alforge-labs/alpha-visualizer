import { test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clearViewerSettings } from '../helpers/locators'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * issue #191 — StrategyScreen の `<SignalChartCard>` (TV candlestick + markers + priceLine)
 * を撮影。issue #187 で feature flag を撤去したため、TV レンダラは常時有効。
 *
 * 出力先: <repo-root>/docs/screenshots/{ja,en}/strategy-signal-tv.png
 */

const STRATEGY_ID = 'sma_cross'
const SCREENSHOT_DIR = resolve(__dirname, '../../../docs/screenshots')

async function ensureDir(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
}

test.describe.serial('StrategySignalChartTV スクリーンショット', () => {
  for (const lang of ['ja', 'en'] as const) {
    test(`strategy-signal-tv (${lang})`, async ({ page }) => {
      await clearViewerSettings(page)
      const suffix = lang === 'en' ? '?lang=en' : ''
      await page.goto(`/detail/${STRATEGY_ID}${suffix}`)
      await page.waitForLoadState('networkidle')

      // Strategy タブをクリックして SignalChartCard を表示させる
      const tabName = lang === 'ja' ? '戦略構成' : 'Strategy'
      const tab = page.getByRole('tab', { name: tabName }).first()
      if (await tab.count()) {
        await tab.click()
      }

      // SignalChartCard の chart コンテナを待つ
      await page.locator('[data-testid="strategy-signal-chart-tv"]').waitFor()
      // チャート描画完了の余裕（lightweight-charts の Canvas 初期化）
      await page.waitForTimeout(300)

      const out = resolve(SCREENSHOT_DIR, lang, 'strategy-signal-tv.png')
      await ensureDir(out)
      await page.screenshot({ path: out })
    })
  }
})
