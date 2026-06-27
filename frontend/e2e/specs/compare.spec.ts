import { expect, test } from '@playwright/test'
import { clearViewerSettings, gotoCompare } from '../helpers/locators'

test.describe('Compare スモーク', () => {
  test.beforeEach(async ({ page }) => {
    await clearViewerSettings(page)
  })

  test('2 戦略の equity チャートと比較テーブルが描画される', async ({ page }) => {
    await gotoCompare(page, ['sma_cross', 'rsi_reversal'])

    await expect(page.getByTestId('compare-main-grid')).toBeVisible()

    // issue #231 以降は TV レンダラが既定（canvas 描画）
    const chart = page.getByTestId('compare-equity-tv')
    await expect(chart).toBeVisible()
    await expect(chart).toHaveAttribute('aria-label', /Compare equity chart, 2 strategies/)
    await expect(chart.locator('canvas').first()).toBeVisible()

    const table = page.getByTestId('compare-table')
    await expect(table).toBeVisible()
    // baseline 1 行 + 非 baseline 1 戦略あたり 2 行（実数 + Δ）= 計 3 行
    await expect(table.locator('tbody tr')).toHaveCount(3)
  })
})
