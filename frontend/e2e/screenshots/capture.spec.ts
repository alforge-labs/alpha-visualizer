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
 * README（ja/en）掲載用スクリーンショットを ja/en 両言語で撮影する。
 * 出力先: <repo-root>/docs/screenshots/{ja,en}/<name>.png
 *
 * playwright.screenshots.config.ts から実行することを想定。
 *
 * 撮影方針（issue: README スクショ撮り直し）:
 * - 撮るのは README に掲載する画面だけに限る（issue #519）。掲載先の無い画像は
 *   撮影時間と、UI 変更のたびに出る差分レビューのコストだけを増やす。チャート
 *   単体の描画退行は e2e/visual/tv-charts.spec.ts（issue #319）が担当する。
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

// ポインタ退避後、ホバー装飾が消えるまでの待機（ms・issue #516）。
const POINTER_PARK_SETTLE_MS = 150

// 要素高さの安定待ちのポーリング設定（issue #509）。
const STABLE_HEIGHT_POLL_INTERVAL_MS = 150
const STABLE_HEIGHT_MAX_POLLS = 60

// 撮影用 viewport。幅は固定（レイアウトの折り返しを言語間で揃えるため）で、
// 高さは要素が収まらなければ captureElement が実測値まで広げる（issue #509）。
const VIEWPORT_WIDTH = 1440
const VIEWPORT_BASE_HEIGHT = 1800
const VIEWPORT_PADDING = 80

async function ensureDir(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
}

/**
 * 撮影直前にポインタを viewport 左上へ退避させる（issue #516）。
 *
 * `switchLanguage()` / `openDetailTab()` の click でポインタは押した要素の中心に
 * 置かれ、その後スクロールしても viewport を変えても座標は動かない。撮影時に
 * ポインタ直下が lightweight-charts の canvas だと、Chromium がスクロール時に
 * 合成する mousemove でホバーが更新され、クロスヘア（十字線・時間軸/価格軸の
 * 追従ラベル）が掲載画像に写り込む。ボタン等のホバー色についても同じ。
 *
 * どこにポインタが残るかは click 時のレイアウト（フォント読み込みのタイミング等）
 * と撮影時の viewport 高さで変わるため、写り込みは実行ごとに揺れる。撮影前に
 * 必ず退避させることで、掲載画像を「カーソルが乗っていない状態」に固定する。
 */
async function parkPointer(page: Page): Promise<void> {
  await page.mouse.move(0, 0)
  // ホバー解除後の再描画（lightweight-charts のクロスヘア消去等）を待つ
  await page.waitForTimeout(POINTER_PARK_SETTLE_MS)
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
 *
 * issue #509: 安定しないままループを抜けたときに黙って return していたため、
 * 描画途中の高さでクロップされた不完全な画像が「撮影成功」として
 * docs/screenshots/ に書き込まれていた。撮影失敗は落として気付ける方が安全
 * なので throw する（`captureElement` が boundingBox 取得失敗で throw するのと
 * 同じ方針）。
 */
async function waitForStableHeight(
  target: Locator,
  minHeight: number,
  name: string,
): Promise<void> {
  let last = -1
  let height = 0
  for (let i = 0; i < STABLE_HEIGHT_MAX_POLLS; i += 1) {
    const box = await target.boundingBox()
    height = box?.height ?? 0
    if (height >= minHeight && height === last) {
      return
    }
    last = height
    await target.page().waitForTimeout(STABLE_HEIGHT_POLL_INTERVAL_MS)
  }
  const waitedMs = STABLE_HEIGHT_MAX_POLLS * STABLE_HEIGHT_POLL_INTERVAL_MS
  throw new Error(
    `高さが安定しませんでした: ${name} — ${waitedMs}ms 待って height=${height} ` +
      `(minHeight=${minHeight})。この状態でクロップすると画像が途中で切れるため撮影を中止します。`,
  )
}

/**
 * ページ全体ではなく、訴求対象の要素そのものをタイトにクロップして撮る。
 * ヘッダー・メトリクス・タブで主役が切れる問題を回避する。
 *
 * 実装メモ: visx の ParentSize 系チャート（OptimizeScatter / CorrelationHeatmap 等）は
 * 親要素が可視領域内に無いと width=0 で描画されない。`Locator.screenshot()` は要素を
 * 分割スクロールして撮るため off-screen 部分のチャートが潰れる。そこで縦長 viewport に
 * 要素全体を収めて描画させ、boundingBox を clip した `page.screenshot()` で撮る。
 *
 * issue #509: `page.screenshot({ clip })` の clip は viewport でクリップされる。
 * 要素が viewport より高いと画像が下端で無言で切れるため、実高さを測ってから
 * viewport を広げ直し、最後に収まっていることを検証してから撮る。
 * （en/strategy は英語ラベルでカード群が縦に伸び、固定の 1800px を超えていた）
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

  const fit = async (viewportHeight: number): Promise<void> => {
    await page.setViewportSize({ width: VIEWPORT_WIDTH, height: viewportHeight })
    await target.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await target.waitFor({ state: 'visible' })
    // visx ParentSize は mount 時に width=0 で測れていることがあるため、
    // 可視化後に resize を発火させて再測定を促す。
    await page.evaluate(() => window.dispatchEvent(new Event('resize')))
    await settle(page)
    await waitForStableHeight(target, minHeight, name)
  }

  await fit(VIEWPORT_BASE_HEIGHT)

  const measured = await target.boundingBox()
  if (!measured) {
    throw new Error(`boundingBox を取得できませんでした: ${name}`)
  }
  // 要素が基準 viewport に収まらないときだけ広げ直す（毎回広げると
  // ParentSize 系チャートの再測定が余計に走るため）。
  //
  // 判定には要素の高さだけでなく viewport 上端からのオフセット（y）も含める。
  // `scrollIntoView({ block: 'center' })` はページ末尾など「これ以上スクロール
  // できない」位置では中央寄せしきれず y > 0 が残るため、height だけを見ると
  // 「収まる」と誤判定して再フィットを飛ばし、直後の検証で必ず落ちていた
  // （en/strategy: y=566・height=1484 → 実際には 2050px 必要なのに needed=1564）。
  //
  // 一方、要素が viewport より高いときは中央寄せで上にはみ出して y が負になる。
  // その負値を足すと needed が過小になり、逆に収まらなくなるため 0 で下限を切る
  // （このとき needed は従来どおり height ベースに縮退する）。
  const needed = Math.ceil(Math.max(measured.y, 0) + measured.height) + VIEWPORT_PADDING
  if (needed > VIEWPORT_BASE_HEIGHT) {
    await fit(needed)
  }

  const box = await target.boundingBox()
  if (!box) {
    throw new Error(`boundingBox を取得できませんでした: ${name}`)
  }
  const viewport = page.viewportSize()
  if (viewport !== null && box.y + box.height > viewport.height + 1) {
    throw new Error(
      `要素が viewport に収まっていません: ${name} — box(y=${Math.round(box.y)}, ` +
        `height=${Math.round(box.height)}) が viewport.height=${viewport.height} を超えています。` +
        'この状態で clip すると画像が下端で切れるため撮影を中止します。',
    )
  }
  await parkPointer(page)
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
  // ページ全体を撮る経路でも `switchLanguage()` の click でポインタが言語切替
  // ボタンに残るため、captureElement と同じく退避させる（issue #516）。
  await parkPointer(page)
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
        // /api/setup/status も実機の forge CLI 状態をそのまま返す実装のため、
        // モックしないとナビの「はじめる」強調ドット（RootLayout が全画面で
        // 参照・issue #493）が撮影環境依存になる。既定は ready=true（強調
        // なし）で固定し、start の撮影テストだけ自前のモックで上書きする。
        await page.route('**/api/setup/status', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ready: true,
              cli: { status: 'ok', version: '1.3.0' },
              eula: { status: 'ok' },
              workspace: { status: 'ok', config_path: '~/alpha-workspace/forge.yaml' },
              auth: { status: 'ok', logged_in: true, plan_type: 'paid' },
              data: { status: 'ok', count: 4 },
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
        // minHeight を明示する（issue #509）。既定の 200px は strategy-screen
        // （≈1100px）に対して低すぎ、カード群が描画途中で 200px を超えた瞬間に
        // 「安定した」と誤判定してクロップされ、画像が途中で切れていた。
        await captureElement(page, lang, 'strategy', page.getByTestId('strategy-screen'), 700)
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

      // start: 「はじめる」チェックリスト（issue #492）。実応答は撮影マシンの
      // CLI 状態依存のため固定モックで撮る。コマンド案内（auth）と GUI 内
      // 導線（data）の両パターンが見えるセットアップ途中の状態を選ぶ。
      test('start', async ({ page }) => {
        await page.route('**/api/setup/status', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ready: false,
              cli: { status: 'ok', version: '1.3.0' },
              eula: { status: 'ok' },
              workspace: { status: 'ok', config_path: '~/alpha-workspace/forge.yaml' },
              auth: { status: 'attention', logged_in: false, plan_type: null },
              data: { status: 'attention', count: 0 },
            }),
          }),
        )
        await page.goto('/start')
        await setLang(page, lang)
        // チェックリスト + 5 ステップガイド（issue #493）が収まる高さ
        await captureViewport(page, lang, 'start', 1480)
      })

      // maintenance: 「整理」画面。バージョン確認・更新セクション（上）と
      // 孤児データ削除（下）の両方を 1 枚に収める。
      //
      // /api/versions と /api/maintenance/orphan-runs はどちらも forge CLI 委譲
      // ＋外部通信（GitHub Releases / PyPI）を含み、E2E フィクスチャには forge
      // バイナリが無いため実応答では両方ともエラー状態になる（e2e/specs/
      // maintenance.spec.ts がその状態を検証している）。撮影は固定モックで行い、
      // 3 コンポーネントの状態（更新あり / 最新 / 表示のみ）が 1 枚で伝わる
      // 組み合わせを選ぶ。
      test('maintenance', async ({ page }) => {
        await page.route('**/api/versions', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              components: [
                {
                  id: 'forge', status: 'ok', current: '1.3.0', latest: '1.4.0',
                  update_available: true, updatable: true, message: null,
                  code: null, as_of: null,
                },
                {
                  id: 'visualizer', status: 'ok', current: '1.6.0', latest: '1.6.0',
                  update_available: false, updatable: true, message: null,
                  code: null, as_of: null,
                },
                // strike は表示のみ（updatable=false）。更新があっても更新ボタンは
                // 出ず、最終同期時刻が併記されることがこの 1 行で伝わる
                {
                  id: 'strike', status: 'ok', current: '1.0.4', latest: '1.0.5',
                  update_available: true, updatable: false, message: null,
                  code: null, as_of: '2026-08-10T09:12:00+09:00',
                },
              ],
            }),
          }),
        )
        await page.route('**/api/maintenance/orphan-runs', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              orphans: [
                {
                  strategy_id: 'sma_cross_old', backtest_run_count: 12,
                  optimization_run_count: 2, bytes: 8_808_038,
                  first_run_at: '2026-05-02', last_run_at: '2026-07-18',
                },
                {
                  strategy_id: 'rsi_reversal_tmp', backtest_run_count: 4,
                  optimization_run_count: 0, bytes: 2_411_724,
                  first_run_at: '2026-06-11', last_run_at: '2026-06-14',
                },
                {
                  strategy_id: 'momo_breakout_v0', backtest_run_count: 1,
                  optimization_run_count: 0, bytes: 612_368,
                  first_run_at: '2026-07-01', last_run_at: '2026-07-01',
                },
              ],
              count: 3,
              total_bytes: 11_832_130,
            }),
          }),
        )
        await page.goto('/maintenance')
        await setLang(page, lang)
        // バージョン表（3 行）＋孤児一覧（3 件）＋削除ボタンの下端 ≈810px に合わせる
        await captureViewport(page, lang, 'maintenance', 880)
      })
    })
  }
})
