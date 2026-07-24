import { expect, test } from '@playwright/test'
import { clearViewerSettings, gotoDetail } from '../helpers/locators'

/**
 * TV チャート（Canvas 描画）のビジュアル回帰テスト（issue #319）。
 *
 * 既存の `e2e/screenshots/` はドキュメント用の画像生成であり比較を伴わない。
 * 本 spec は `toHaveScreenshot()` でコミット済みベースラインと突き合わせ、
 * marker / priceLine / 背景バンドの描画退行を検出する。
 *
 * ベースラインは **CI（linux）で生成したものをコミットする**。Playwright の
 * スナップショットは OS ごとにファイル名が分かれるため、macOS で生成しても
 * CI では使われない。手順は e2e/visual/README.md を参照。
 *
 * 閾値について: 完全一致は取らず `maxDiffPixelRatio` を許容する。
 * ランナーイメージ更新に伴うフォントのアンチエイリアス差で偽陽性を出さないため。
 * （alpha-forge のゴールデンテストで ARM↔x86 の 1 ULP 差に起因する
 * バーシフトを踏んだ経験から、Canvas 比較も厳密一致は避ける方針）
 */

/** チャート本体以外（日付ラベル等）の差分で落ちないよう、許容比率を持たせる */
const SNAPSHOT_OPTIONS = {
  maxDiffPixelRatio: 0.02,
  animations: 'disabled',
  // マウス位置由来のクロスヘア表示を避ける
  caret: 'hide',
} as const

test.describe('TV チャートのビジュアル回帰 (issue #319)', () => {
  test.beforeEach(async ({ page }) => {
    await clearViewerSettings(page)
  })

  test('エクイティ & ドローダウン（IS/OOS マーカー付き）', async ({ page }) => {
    await gotoDetail(page, 'sma_cross')
    await page.waitForLoadState('networkidle')
    const chart = page.getByTestId('backtest-equity-chart-tv')
    await chart.waitFor({ state: 'visible' })
    await page.mouse.move(0, 0)
    // Canvas の初期描画完了を待つ（lightweight-charts は rAF で描く）
    await page.waitForTimeout(600)
    await expect(chart).toHaveScreenshot('equity-drawdown-tv.png', SNAPSHOT_OPTIONS)
  })

  test('シグナル時系列（ローソク + entry/exit マーカー + SL/TP priceLine）', async ({ page }) => {
    await gotoDetail(page, 'sma_cross')
    await page.waitForLoadState('networkidle')
    // 条件付きクリックにすると、タブ未描画のときに黙って素通りしてしまう
    const tab = page.getByRole('tab', { name: '戦略構成' }).first()
    await expect(tab).toBeVisible()
    await tab.click()

    const chart = page.getByTestId('strategy-signal-chart-tv')
    await chart.waitFor({ state: 'visible' })
    // タブをクリックした位置にマウスが残るとクロスヘア（点線+価格ラベル）が
    // 写り込み、レイアウトが少しずれるだけで差分になる。撮影前に退避させる
    await page.mouse.move(0, 0)
    await page.waitForTimeout(600)
    await expect(chart).toHaveScreenshot('strategy-signal-tv.png', SNAPSHOT_OPTIONS)
  })
})

/**
 * 同一ランで 2 回撮って一致することを確認する決定性チェック。
 *
 * ベースライン比較（上の 2 テスト）はランナー環境の差でも落ちうるが、
 * こちらは環境差の影響を受けず「描画そのものが非決定的になっていないか」だけを見る。
 * ベースラインを持たないため、CI で最初から動かせる。
 */
test.describe('TV チャート描画の決定性 (issue #319)', () => {
  test('同一データを 2 回描画してもピクセルが一致する', async ({ page }) => {
    await clearViewerSettings(page)
    await gotoDetail(page, 'sma_cross')
    const chart = page.getByTestId('backtest-equity-chart-tv')
    await chart.waitFor({ state: 'visible' })
    await page.waitForTimeout(600)
    const first = await chart.screenshot({ animations: 'disabled' })

    await page.reload()
    await chart.waitFor({ state: 'visible' })
    await page.waitForTimeout(600)
    const second = await chart.screenshot({ animations: 'disabled' })

    expect(Buffer.compare(first, second)).toBe(0)
  })
})
