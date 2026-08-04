import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  clearViewerSettings,
  gotoBrowse,
  gotoCompare,
  gotoDetail,
  gotoLive,
  switchLanguage,
  type Lang,
} from '../helpers/locators'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * README / alforge-labs サイト掲載用スクリーンショットを ja/en 両言語で撮影する。
 * 出力先: <repo-root>/docs/screenshots/{ja,en}/<name>.png
 *
 * playwright.screenshots.config.ts から実行することを想定。
 *
 * 撮影方針（issue: README スクショ撮り直し）:
 * - 「アピールしたい主役（チャート・構造）」がヘッダー/メトリクスで切れないよう、
 *   グリッド掲載分（detail/compare/optimize/strategy）は showcase コンポーネントを
 *   element 単位でタイトにクロップする。
 * - hero（browse）はコンテキスト維持のため縦長 viewport でヘッダー＋表を収める。
 */

const STRATEGY_ID = 'sma_cross'
// 最適化（パラメータ感度散布図）はトライアル列を持つ戦略でないと空になる。
// フィクスチャでは rsi_reversal が 20 トライアルの scatter データを持つ
// （sma_cross は WFO 形式・momo_breakout は最適化データ無し）。
const OPTIMIZE_STRATEGY_ID = 'rsi_reversal'
const COMPARE_IDS = ['sma_cross', 'rsi_reversal', 'momo_breakout'] as const

const SCREENSHOT_DIR = resolve(__dirname, '../../../docs/screenshots')

// チャート/キャンバス（visx・lightweight-charts）の描画が落ち着くまでの待機（ms）。
const CHART_SETTLE_MS = 500

async function ensureDir(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
}

async function settle(page: Page): Promise<void> {
  // データ取得・チャート描画が落ち着くのを待つ
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(CHART_SETTLE_MS)
}

/**
 * visx / lightweight-charts は ResizeObserver で遅延測定されるため、
 * スクロール直後は要素高さが潰れていることがある。高さが下限以上で
 * 安定するまでポーリングしてからクロップする。
 */
async function waitForStableHeight(target: Locator, minHeight: number): Promise<void> {
  let last = -1
  for (let i = 0; i < 25; i += 1) {
    const box = await target.boundingBox()
    const height = box?.height ?? 0
    if (height >= minHeight && height === last) {
      return
    }
    last = height
    await target.page().waitForTimeout(150)
  }
}

/**
 * ページ全体ではなく、訴求対象の要素そのものをタイトにクロップして撮る。
 * ヘッダー・メトリクス・タブで主役が切れる問題を回避する。
 *
 * 実装メモ: visx の ParentSize 系チャート（OptimizeScatter / CorrelationHeatmap 等）は
 * 親要素が可視領域内に無いと width=0 で描画されない。`Locator.screenshot()` は要素を
 * 分割スクロールして撮るため off-screen 部分のチャートが潰れる。そこで縦長 viewport に
 * 要素全体を収めて描画させ、boundingBox を clip した `page.screenshot()` で撮る。
 */
async function captureElement(
  page: Page,
  lang: Lang,
  name: string,
  target: Locator,
  minHeight = 200,
): Promise<void> {
  const filePath = resolve(SCREENSHOT_DIR, lang, `${name}.png`)
  await ensureDir(filePath)
  // 想定要素（最大 strategy-screen ≈ 1100px）が丸ごと収まる高さにする。
  await page.setViewportSize({ width: 1440, height: 1800 })
  await target.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await target.waitFor({ state: 'visible' })
  // visx ParentSize は mount 時に width=0 で測れていることがあるため、
  // 可視化後に resize を発火させて再測定を促す。
  await page.evaluate(() => window.dispatchEvent(new Event('resize')))
  await settle(page)
  await waitForStableHeight(target, minHeight)
  const box = await target.boundingBox()
  if (!box) {
    throw new Error(`boundingBox を取得できませんでした: ${name}`)
  }
  await page.screenshot({ path: filePath, clip: box })
}

/**
 * hero など、アプリのコンテキストを保ったまま縦長 viewport で撮る。
 */
async function captureViewport(
  page: Page,
  lang: Lang,
  name: string,
  height: number,
): Promise<void> {
  const filePath = resolve(SCREENSHOT_DIR, lang, `${name}.png`)
  await ensureDir(filePath)
  await page.setViewportSize({ width: 1440, height })
  await page.evaluate(() => window.scrollTo(0, 0))
  await settle(page)
  await page.screenshot({ path: filePath })
}

async function setLang(page: Page, lang: Lang): Promise<void> {
  if (lang === 'ja') {
    return
  }
  await switchLanguage(page, lang)
  // 言語切替直後はテキストの再描画があるので少し待つ
  await page.waitForLoadState('networkidle')
}

async function openDetailTab(page: Page, ja: string, en: string, lang: Lang): Promise<void> {
  const name = lang === 'ja' ? ja : en
  const tab = page.getByRole('tab', { name, exact: true })
  // click() は要素の出現（actionability）を待つため、goto 直後でも取りこぼさない。
  await tab.click()
  // タブが実際に選択状態へ切り替わったことを確認してから本文ロードを待つ。
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  await page.waitForLoadState('networkidle')
}

test.describe.serial('README / docs 用スクリーンショット撮影', () => {
  for (const lang of ['ja', 'en'] as const) {
    test.describe(`lang=${lang}`, () => {
      test.beforeEach(async ({ page }) => {
        await clearViewerSettings(page)
        // /api/agent/backends はフィクスチャの静的データではなく、実機の
        // `shutil.which("claude"/"codex")` 検出結果をそのまま返す実装のため、
        // モックしないと撮影マシンの CLI 導入有無でナビの「開発」タブ表示
        // （RootLayout が全画面で呼ぶ）が揺れ、develop 以外の PNG も撮影環境
        // 依存になってしまう。全撮影を決定的にするため describe 共通で固定する。
        await page.route('**/api/agent/backends', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              enabled: true,
              backends: [
                { id: 'claude', available: true, version: '2.1.220 (Claude Code)' },
                { id: 'codex', available: true, version: 'codex-cli 0.145.0' },
              ],
              // ターン上限欄のプレースホルダに出るため、撮影結果を決定的に
              // するにはサーバー既定値もモックに含める必要がある
              default_max_turns: 100,
              max_max_turns: 500,
            }),
          }),
        )
      })

      // hero: ヘッダー＋表＋フッタが収まる縦長 viewport
      // （レシピ・ロールアップで銘柄カバレッジが既定で畳まれたため、旧 1180 は
      // 余白が大きすぎた。実測 footer 下端 ≈875px に合わせて 900 に詰めた）
      test('browse', async ({ page }) => {
        await gotoBrowse(page)
        await setLang(page, lang)
        await captureViewport(page, lang, 'browse', 900)
      })

      // detail: 「エクイティ & ドローダウン」カード（タイトル＋チャート）をクロップ
      test('detail', async ({ page }) => {
        await gotoDetail(page, STRATEGY_ID)
        await setLang(page, lang)
        // backtest-equity-chart-tv の親 div = セクションラベル＋エクイティチャート
        // （issue #231 以降は TV レンダラが既定）
        const equitySection = page.getByTestId('backtest-equity-chart-tv').locator('..')
        await captureElement(page, lang, 'detail', equitySection, 280)
      })

      // strategy: 戦略構造カード群（パラメータ／指標／ルール）
      test('detail-strategy', async ({ page }) => {
        await gotoDetail(page, STRATEGY_ID)
        await setLang(page, lang)
        await openDetailTab(page, '戦略構成', 'Strategy', lang)
        await captureElement(page, lang, 'strategy', page.getByTestId('strategy-screen'))
      })

      // optimize: 最適化トライアル分析（パラメータ感度散布図＋上位トライアル）
      test('detail-optimize', async ({ page }) => {
        await gotoDetail(page, OPTIMIZE_STRATEGY_ID)
        await setLang(page, lang)
        await openDetailTab(page, '最適化', 'Optimize', lang)
        await captureElement(page, lang, 'optimize', page.getByTestId('optimize-screen'), 400)
      })

      // compare（主）: 正規化エクイティ＋指標比較
      test('compare', async ({ page }) => {
        await gotoCompare(page, COMPARE_IDS)
        await setLang(page, lang)
        await captureElement(page, lang, 'compare', page.getByTestId('compare-main-grid'))
      })

      // compare（相関ヒートマップ）: README 採用検討用に別撮り
      test('compare-heatmap', async ({ page }) => {
        await gotoCompare(page, COMPARE_IDS)
        await setLang(page, lang)
        await captureElement(
          page,
          lang,
          // testid はラベル div に付くため、親 Card（ラベル＋説明＋ヒートマップ本体）を撮る
          'compare-heatmap',
          page.getByTestId('correlation-heatmap-card').locator('..'),
          240,
        )
      })

      // live: KPI 行＋ベンチマーク比較チャート＋建玉テーブル
      // （fixture の建玉には含み損益 null の行が含まれ、`—` と実数が混在した
      //  ときのレイアウトも撮影対象に入る）
      test('live', async ({ page }) => {
        await gotoLive(page)
        await setLang(page, lang)
        await captureElement(page, lang, 'live', page.getByTestId('live-position-view'), 600)
      })

      // ideas: 既存どおりページ全体（README 未掲載）
      test('ideas', async ({ page }) => {
        await page.goto('/ideas')
        await setLang(page, lang)
        const filePath = resolve(SCREENSHOT_DIR, lang, 'ideas.png')
        await ensureDir(filePath)
        await settle(page)
        await page.screenshot({ path: filePath })
      })

      // develop: AI 戦略開発ビュー（フォーム表示状態）
      // /api/agent/backends の固定モックは describe 共通の beforeEach で
      // 適用済み（両バックエンド利用可能なフォーム状態を撮影）。
      test('develop', async ({ page }) => {
        await page.goto('/develop')
        await setLang(page, lang)
        await captureViewport(page, lang, 'develop', 700)
      })

      // data: データ管理画面（issue #484）。/api/data は forge CLI 委譲かつ
      // 鮮度が parquet の mtime 依存で、撮影マシンごとに応答が揺れるため
      // 固定モックで撮る（要更新バッジあり・なしの両方を含める）。
      test('data', async ({ page }) => {
        await page.route('**/api/data', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              datasets: [
                {
                  symbol: 'CL=F', interval: '1d', start: '2021-08-01', end: '2026-08-03',
                  rows: 1258, size_bytes: 66560,
                  updated_at: '2026-08-03T21:00:00+00:00', stale: false,
                },
                {
                  symbol: 'GC=F', interval: '1d', start: '2021-08-01', end: '2026-08-03',
                  rows: 1258, size_bytes: 66048,
                  updated_at: '2026-08-03T21:00:00+00:00', stale: false,
                },
                {
                  symbol: 'SPY', interval: '1d', start: '2020-01-02', end: '2026-07-28',
                  rows: 1652, size_bytes: 84992,
                  updated_at: '2026-07-28T21:00:00+00:00', stale: true,
                },
                {
                  symbol: 'SPY', interval: '4h', start: '2024-08-01', end: '2026-08-03',
                  rows: 1140, size_bytes: 43008,
                  updated_at: '2026-08-03T21:00:00+00:00', stale: false,
                },
              ],
              count: 4,
            }),
          }),
        )
        await page.goto('/data')
        await setLang(page, lang)
        await captureViewport(page, lang, 'data', 700)
      })
    })
  }
})
