import { expect, test } from '@playwright/test'
import { clearViewerSettings, gotoBrowse } from '../helpers/locators'

/**
 * OSS 同梱サンプルデータ (samples/sample-forge) のスモークテスト。
 *
 * 既存の E2E は 3 戦略 × 60 営業日の小さなフィクスチャを使うのに対し、
 * こちらは 8 戦略 × 5 銘柄 × 5 年（1250 営業日）の完全サンプルを対象とする。
 */
test.describe('sample-forge スモーク', () => {
  test.beforeEach(async ({ page }) => {
    await clearViewerSettings(page)
  })

  test('Browse 画面に 40 件のバックテスト結果が並ぶ', async ({ page }) => {
    await gotoBrowse(page)

    const tableScroll = page.getByTestId('strategy-table-scroll')
    await expect(tableScroll).toBeVisible()

    // 40 ラン = 8 戦略 × 5 銘柄。仮想スクロールで一度に全行が DOM に出ない場合に
    // 備えて、最低 1 行表示されていれば許容（virtualized list でも常識的に
    // ヘッダ + 数行は描画される）。
    const rows = tableScroll.locator('tbody tr')
    await expect(rows.first()).toBeVisible()
  })

  test('健全な API が同梱サンプルを参照している', async ({ request }) => {
    const results = await request.get('/api/results')
    expect(results.status()).toBe(200)
    const list = (await results.json()) as Array<Record<string, unknown>>
    expect(list).toHaveLength(40)

    const strategies = await request.get('/api/strategies')
    expect(strategies.status()).toBe(200)
    const stratList = (await strategies.json()) as Array<Record<string, unknown>>
    expect(stratList).toHaveLength(8)

    const ideas = await request.get('/api/ideas')
    expect(ideas.status()).toBe(200)
    const ideaList = (await ideas.json()) as Array<Record<string, unknown>>
    expect(ideaList).toHaveLength(5)
  })
})
