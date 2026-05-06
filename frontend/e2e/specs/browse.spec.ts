import { expect, test } from '@playwright/test'
import { clearViewerSettings, gotoBrowse } from '../helpers/locators'

test.describe('Browse スモーク', () => {
  test.beforeEach(async ({ page }) => {
    await clearViewerSettings(page)
  })

  test('戦略一覧が表示され slide panel が開閉できる', async ({ page }) => {
    await gotoBrowse(page)

    const tableScroll = page.getByTestId('strategy-table-scroll')
    await expect(tableScroll).toBeVisible()

    // フィクスチャは 3 戦略
    const rows = tableScroll.locator('tbody tr')
    await expect(rows).toHaveCount(3)

    // 1 行目をクリック → slide panel が開く
    await rows.first().click()
    const panel = page.getByTestId('strategy-slide-panel')
    await expect(panel).toBeVisible()

    // 同じ行を再クリック（トグル仕様）または閉じるボタンで閉じる
    const closeBtn = panel.getByRole('button', { name: /閉じる|Close/ })
    if (await closeBtn.count()) {
      await closeBtn.first().click()
    } else {
      await rows.first().click()
    }
    await expect(panel).not.toBeVisible()
  })
})
