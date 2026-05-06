import { expect, test } from '@playwright/test'
import { clearViewerSettings, gotoBrowse, switchLanguage } from '../helpers/locators'

test.describe('i18n スモーク', () => {
  test.beforeEach(async ({ page }) => {
    await clearViewerSettings(page)
  })

  test('言語切替で UI 文言が ja ↔ en で切り替わる', async ({ page }) => {
    await gotoBrowse(page)

    // 初期は ja。日本語の見出しがどこかに存在する
    await expect(page.getByText('戦略ブラウザ').first()).toBeVisible()

    // English に切替
    await switchLanguage(page, 'en')
    await expect(page.getByText('Strategy browser').first()).toBeVisible()

    // ja に戻す
    await switchLanguage(page, 'ja')
    await expect(page.getByText('戦略ブラウザ').first()).toBeVisible()
  })
})
