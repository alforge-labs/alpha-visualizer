import { expect, test } from '@playwright/test'
import { clearViewerSettings, gotoBrowse } from '../helpers/locators'

test.describe('Browse スモーク', () => {
  test.beforeEach(async ({ page }) => {
    await clearViewerSettings(page)
  })

  test('レシピ単位で表示され slide panel が開閉できる', async ({ page }) => {
    await gotoBrowse(page)

    const tableScroll = page.getByTestId('strategy-table-scroll')
    await expect(tableScroll).toBeVisible()

    // 11 戦略 → 8 レシピ。うち実行実績があるのは 6 で、既定は未実行のみを隠す
    const rows = tableScroll.locator('tbody tr')
    await expect(rows).toHaveCount(6)

    await rows.first().click()
    const panel = page.getByTestId('strategy-slide-panel')
    await expect(panel).toBeVisible()

    const closeBtn = panel.getByRole('button', { name: /閉じる|Close/ })
    if (await closeBtn.count()) {
      await closeBtn.first().click()
    } else {
      await rows.first().click()
    }
    await expect(panel).not.toBeVisible()
  })

  test('フッタが表示件数と隠した未実行レシピ数を出す', async ({ page }) => {
    await gotoBrowse(page)
    const footer = page.getByTestId('strategy-table-footer')
    await expect(footer).toContainText('6')
    await expect(footer).toContainText('8')
    await expect(footer).toContainText('2')
    await expect(footer).toContainText('11')
    await expect(footer).toContainText('非表示')
  })

  test('未実行を含めるとレシピが増える', async ({ page }) => {
    await gotoBrowse(page)
    const rows = page.getByTestId('strategy-table-scroll').locator('tbody tr')
    await expect(rows).toHaveCount(6)

    // .check() は内部の checked 検証がクリック直後の 1 回きりで、React の
    // 再レンダーが 1 tick 遅れるとまれに誤って失敗する（他テストの後に実行
    // した場合に再現）。.click() + toBeChecked() の明示的なポーリング待ちに
    // 置き換えて安定させる。
    const checkbox = page.getByRole('checkbox', { name: /未実行を含める/ })
    await checkbox.click()
    await expect(checkbox).toBeChecked()
    await expect(rows).toHaveCount(8)
  })

  test('同名 3 試行が 1 行に畳まれ展開で個別戦略が出る', async ({ page }) => {
    await gotoBrowse(page)
    const rows = page.getByTestId('strategy-table-scroll').locator('tbody tr')

    // "EMA Trend Following" は 3 試行 1 レシピ
    await expect(page.getByText(/3 試行中 2 件実行/)).toBeVisible()

    await page.getByRole('button', { name: /EMA Trend Following の試行を展開/ }).click()
    // 6 レシピ + 展開した 3 variant
    await expect(rows).toHaveCount(9)
    await expect(page.getByText('ema_trend_v3')).toBeVisible()
  })

  test('同名でも銘柄が違えば別レシピになる', async ({ page }) => {
    await gotoBrowse(page)
    // "Dual Symbol Recipe" が SPY と QQQ で 2 行
    await expect(page.getByText('Dual Symbol Recipe')).toHaveCount(2)
  })

  test('銘柄カバレッジは既定で畳まれている', async ({ page }) => {
    await gotoBrowse(page)
    const toggle = page.getByTestId('symbol-coverage-collapsible').getByRole('button')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('heading', { name: /銘柄カバレッジ|Symbol coverage/ })).toHaveCount(0)

    await toggle.click()
    await expect(page.getByRole('heading', { name: /銘柄カバレッジ|Symbol coverage/ })).toBeVisible()
  })

  test('銘柄カバレッジに未実行列が出る', async ({ page }) => {
    await gotoBrowse(page)
    await page.getByTestId('symbol-coverage-collapsible').getByRole('button').click()
    await expect(page.getByRole('columnheader', { name: /未実行|Unrun/ })).toBeVisible()
  })
})
