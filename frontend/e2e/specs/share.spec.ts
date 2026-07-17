import { expect, test } from '@playwright/test'
import { clearViewerSettings, gotoDetail } from '../helpers/locators'

/**
 * シェア導線の E2E（Wave 6）。
 *
 * シェアカード（PNG 保存）と X 共有（保存＋投稿インテント）は
 * AlphaForge 送客ファネルの中核なので、jsdom のユニットテストに加えて
 * 実ブラウザでダウンロード発火とインテント遷移を保証する。
 */
test.describe('シェア導線', () => {
  test.beforeEach(async ({ page }) => {
    await clearViewerSettings(page)
  })

  test('シェアカードボタンで PNG ダウンロードが発火する', async ({ page }) => {
    await gotoDetail(page, 'sma_cross')
    await expect(page.getByTestId('backtest-screen')).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /シェアカード|Share card/ }).first().click()
    const download = await downloadPromise

    // ファイル名はブランドプレフィックス付き（lib/shareCard.shareCardFilename）
    expect(download.suggestedFilename()).toMatch(/^alphaforge_sma_cross_.+\.png$/)
    await download.delete()
  })

  test('X で共有ボタンでカード保存と投稿インテントが同時に走る', async ({
    page,
    context,
  }) => {
    await gotoDetail(page, 'sma_cross')
    await expect(page.getByTestId('backtest-screen')).toBeVisible()

    // 実際に x.com へ出て行かないようにルーティングで止める（URL のみ検証）
    await context.route('https://x.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '' }),
    )

    const pagePromise = context.waitForEvent('page')
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /X で共有|Share on X/ }).first().click()

    const popup = await pagePromise
    await popup.waitForURL(/^https:\/\/x\.com\/intent\/post/)
    const decoded = decodeURIComponent(popup.url())
    expect(decoded).toContain('sma_cross')
    expect(decoded).toContain('Backtested with AlphaForge')
    expect(decoded).toContain('utm_source=x')

    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.png$/)
    await download.delete()
  })
})
