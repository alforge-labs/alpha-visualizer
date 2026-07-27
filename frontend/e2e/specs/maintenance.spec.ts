import { expect, test } from '@playwright/test'
import { clearViewerSettings, gotoBrowse, gotoMaintenance } from '../helpers/locators'

/**
 * E2E 環境（frontend/e2e/fixtures/forge）には forge バイナリが無い。そのため
 * /maintenance は一覧取得が「forge 未導入」エラーで失敗する状態を描く。これは
 * 実際に AlphaForge を導入していないユーザーが見る画面そのものなので、その
 * エラー状態を検証対象にする（表の中身の検証は Task 2 の単体テストが担う）。
 */
test.describe('Maintenance スモーク', () => {
  test.beforeEach(async ({ page }) => {
    await clearViewerSettings(page)
  })

  test('AppNav の「整理」リンクから /maintenance に遷移できる', async ({ page }) => {
    await gotoBrowse(page)
    await page.getByRole('link', { name: '整理' }).click()
    await expect(page).toHaveURL(/\/maintenance$/)
    await expect(page.getByTestId('maintenance-screen')).toBeVisible()
  })

  test('/maintenance を直接開いても 404 にならず描画される', async ({ page }) => {
    await gotoMaintenance(page)
    await expect(page.getByTestId('maintenance-screen')).toBeVisible()
    await expect(page.getByRole('heading', { name: '整理' })).toBeVisible()
  })

  test('forge 未導入環境では導線付きのエラーが出る', async ({ page }) => {
    await gotoMaintenance(page)
    const banner = page.getByRole('alert')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('alforgelabs.com')
    await expect(page.getByRole('button', { name: '再試行' })).toBeVisible()
  })
})
