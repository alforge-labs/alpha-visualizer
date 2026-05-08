import { expect, test } from '@playwright/test'
import { clearViewerSettings, gotoDetail } from '../helpers/locators'

test.describe('Detail スモーク', () => {
  test.beforeEach(async ({ page }) => {
    await clearViewerSettings(page)
  })

  test('sma_cross の主要タブを順次切り替えられる', async ({ page }) => {
    await gotoDetail(page, 'sma_cross')

    // backtest タブ（既定）
    await expect(page.getByTestId('backtest-screen')).toBeVisible()
    await expect(page.getByTestId('backtest-equity-chart')).toBeVisible()

    // IS / OOS タブ
    await page.getByRole('tab', { name: 'IS / OOS' }).click()
    await expect(page.getByTestId('isoos-screen')).toBeVisible()

    // WFO タブ
    //   fixture には sma_cross の WFO データが無いため PROD bundle では
    //   mock fallback されず error note が表示される（DEV では mock が出る）。
    //   ここではタブが選択状態に切り替わることのみを検証する。
    const wfoTab = page.getByRole('tab', { name: 'WFO' })
    await wfoTab.click()
    await expect(wfoTab).toHaveAttribute('aria-selected', 'true')

    // 実行履歴タブ
    await page.getByRole('tab', { name: /実行履歴|Run History/ }).click()
    await expect(page.getByTestId('history-tab')).toBeVisible()

    // 戦略構成タブ
    await page.getByRole('tab', { name: /戦略構成|Strategy/ }).click()
    await expect(page.getByTestId('strategy-screen')).toBeVisible()
  })

  test('rsi_reversal の Optimize タブが描画される', async ({ page }) => {
    // optimization_runs を持つ戦略でのみ Optimize 画面が表示される
    await gotoDetail(page, 'rsi_reversal')
    await page.getByRole('tab', { name: /最適化|Optimize/ }).click()
    await expect(page.getByTestId('optimize-screen')).toBeVisible()
  })
})
