import { expect, test } from '@playwright/test'
import { clearViewerSettings, gotoCompare } from '../helpers/locators'

test.describe('Compare スモーク', () => {
  test.beforeEach(async ({ page }) => {
    await clearViewerSettings(page)
  })

  test('2 戦略の equity チャートと比較テーブルが描画される', async ({ page }) => {
    await gotoCompare(page, ['sma_cross', 'rsi_reversal'])

    await expect(page.getByTestId('compare-main-grid')).toBeVisible()

    const chart = page.getByLabel(/Compare equity chart, 2 strategies/)
    await expect(chart).toBeVisible()
    // visx の SVG パスが少なくとも 1 本描画されていること
    await expect(chart.locator('path').first()).toBeVisible()

    const table = page.getByTestId('compare-table')
    await expect(table).toBeVisible()
    // baseline 1 行 + 非 baseline 1 戦略あたり 2 行（実数 + Δ）= 計 3 行
    await expect(table.locator('tbody tr')).toHaveCount(3)
  })
})
