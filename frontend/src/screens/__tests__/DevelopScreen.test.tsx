import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, it, expect, vi } from 'vitest'
import type { AgentBackendsResponse } from '../../api/types'
import type { DevelopScreenProps } from '../DevelopScreen'
import { DevelopScreen } from '../DevelopScreen'

const BOTH_AVAILABLE: AgentBackendsResponse = {
  enabled: true, default_max_turns: 100, max_max_turns: 500,
  backends: [
    { id: 'claude', available: true, version: '1.2.3' },
    { id: 'codex', available: true, version: '0.9.0' },
  ],
}

function renderScreen(overrides: Partial<DevelopScreenProps> = {}) {
  const onStart = vi.fn()
  const onCancel = vi.fn()
  const onSetLang = vi.fn()
  const onSetTheme = vi.fn()
  const props: DevelopScreenProps = {
    lang: 'ja',
    theme: 'light',
    backends: BOTH_AVAILABLE,
    backendsLoading: false,
    running: false,
    status: null,
    logLines: [],
    result: null,
    error: null,
    onStart,
    onCancel,
    onSetLang,
    onSetTheme,
    ...overrides,
  }
  render(
    <MemoryRouter>
      <DevelopScreen {...props} />
    </MemoryRouter>,
  )
  return { onStart, onCancel, onSetLang, onSetTheme }
}

/**
 * issue #486: 未取得銘柄で AI 開発を始めるとエージェントがデータ取得から
 * 詰まる（特に codex はサンドボックスの DNS 遮断で実行中に取得できない）。
 * 入力時点で警告し、データ画面のプリフィル付きフォームへ誘導する。
 */
describe('DevelopScreen データ未取得警告 (issue #486)', () => {
  it('入力した銘柄のデータが未取得なら警告とデータ画面への導線を出す', async () => {
    renderScreen({ datasetSymbols: ['SPY', 'QQQ'] })
    await userEvent.type(screen.getByLabelText(/銘柄/), 'CL=F')
    expect(screen.getByText(/未取得/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /データ画面で取得/ })
    expect(link.getAttribute('href')).toBe('/data?symbol=CL%3DF&interval=1d')
  })

  it('取得済み銘柄では警告を出さない（大文字小文字は無視）', async () => {
    renderScreen({ datasetSymbols: ['CL=F'] })
    await userEvent.type(screen.getByLabelText(/銘柄/), 'cl=f')
    expect(screen.queryByText(/未取得/)).toBeNull()
  })

  it('一覧が取得できていない（null / 未指定）ときは警告を出さない', async () => {
    renderScreen({ datasetSymbols: null })
    await userEvent.type(screen.getByLabelText(/銘柄/), 'CL=F')
    expect(screen.queryByText(/未取得/)).toBeNull()
  })
})

describe('<DevelopScreen />', () => {
  // 検証 0: SettingsToggles（言語切替 UI）がレンダリングされる（他画面は個別に
  // レンダリングしているが Develop 画面だけ欠落していた不具合の再発防止）
  it('SettingsToggles（言語切替 UI）がレンダリングされ、クリックで onSetLang が呼ばれる', async () => {
    const { onSetLang } = renderScreen()
    const enToggle = screen.getByRole('radio', { name: /English/ })
    await userEvent.click(enToggle)
    expect(onSetLang).toHaveBeenCalledWith('en')
  })

  // 検証 0.5: backendsLoading: true → localhost 案内もフォームも出さず、中立の
  // ローディング表示のみを出す（初回 fetch 解決前の誤案内防止、issue 2026-08-02）
  it('backendsLoading が true のとき localhost 案内が出ず、ローディング表示が出る', () => {
    renderScreen({ backendsLoading: true, backends: null })
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText(/localhost/)).toBeNull()
    expect(screen.queryByLabelText(/ゴール/)).toBeNull()
  })

  // 検証 1: backends.enabled === false → localhost 限定の案内が出てフォームが出ない
  it('backends.enabled が false のとき localhost 限定の案内が出てフォームが出ない', () => {
    renderScreen({ backends: { enabled: false, default_max_turns: 100, max_max_turns: 500, backends: [] } })
    expect(screen.getByText(/localhost/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/ゴール/)).toBeNull()
  })

  it('backends が null のときも localhost 限定の案内が出る（未取得/取得失敗の縮退）', () => {
    renderScreen({ backends: null })
    expect(screen.getByText(/localhost/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/ゴール/)).toBeNull()
  })

  // 検証 2: 両バックエンド available:false → 導入案内カード（claude/codex 導入 URL リンク）
  it('両バックエンドが available:false のとき導入案内カードが claude/codex それぞれの導入リンクとともに出る', () => {
    renderScreen({
      backends: {
        enabled: true, default_max_turns: 100, max_max_turns: 500,
        backends: [
          { id: 'claude', available: false, version: null },
          { id: 'codex', available: false, version: null },
        ],
      },
    })
    const links = screen.getAllByRole('link')
    expect(links.some((l) => l.getAttribute('href') === 'https://claude.com/claude-code')).toBe(
      true,
    )
    expect(
      links.some((l) => l.getAttribute('href') === 'https://developers.openai.com/codex/cli'),
    ).toBe(true)
    // フォームは出ない
    expect(screen.queryByLabelText(/ゴール/)).toBeNull()
  })

  // 検証 3: available: true のバックエンドだけが選択肢に出る
  it('available: true のバックエンドだけが選択肢に出る', () => {
    renderScreen({
      backends: {
        enabled: true, default_max_turns: 100, max_max_turns: 500,
        backends: [
          { id: 'claude', available: true, version: '1.2.3' },
          { id: 'codex', available: false, version: null },
        ],
      },
    })
    const select = screen.getByLabelText(/バックエンド/) as HTMLSelectElement
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).toEqual(['claude'])
  })

  // 検証 4: ゴール未入力で開始ボタンが disabled（WHY: 空ゴールはサーバーで 422 になるだけの無駄往復）
  it('ゴール未入力のとき開始ボタンが disabled', () => {
    renderScreen()
    expect(screen.getByRole('button', { name: /開始/ })).toBeDisabled()
  })

  it('ゴールを入力すると開始ボタンが有効になり onStart が入力内容で呼ばれる', async () => {
    const { onStart } = renderScreen()
    await userEvent.type(screen.getByLabelText(/ゴール/), 'CL=F の勝率を改善したい')
    const startButton = screen.getByRole('button', { name: /開始/ })
    expect(startButton).toBeEnabled()
    await userEvent.click(startButton)
    // ターン上限は未入力 → null（サーバー既定に任せる）
    expect(onStart).toHaveBeenCalledWith('CL=F の勝率を改善したい', '', 'claude', null)
  })

  // 検証 4.5: ターン上限の指定（issue: EULA 誤診断の真因だったターン上限到達）
  it('ターン上限を入力すると onStart に数値で渡り、既定値がプレースホルダに出る', async () => {
    const { onStart } = renderScreen()
    const turnInput = screen.getByLabelText(/ターン上限/)
    // 既定値はサーバー応答由来（フロントに二重定義しない）
    expect(turnInput).toHaveAttribute('placeholder', '100')
    await userEvent.type(screen.getByLabelText(/ゴール/), 'g')
    await userEvent.type(turnInput, '250')
    await userEvent.click(screen.getByRole('button', { name: /開始/ }))
    expect(onStart).toHaveBeenCalledWith('g', '', 'claude', 250)
  })

  it('範囲外のターン上限は null に落として送らない（サーバーで 422 になる値を投げない）', async () => {
    const { onStart } = renderScreen()
    await userEvent.type(screen.getByLabelText(/ゴール/), 'g')
    await userEvent.type(screen.getByLabelText(/ターン上限/), '9999')
    await userEvent.click(screen.getByRole('button', { name: /開始/ }))
    expect(onStart).toHaveBeenCalledWith('g', '', 'claude', null)
  })

  it('codex を選ぶとターン上限の入力欄は出ない（codex exec に相当フラグが無い）', async () => {
    renderScreen()
    expect(screen.getByLabelText(/ターン上限/)).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText(/バックエンド/), 'codex')
    expect(screen.queryByLabelText(/ターン上限/)).toBeNull()
  })

  // 検証 5: running: true → ログ領域（logLines の内容）とキャンセルボタンが出る
  it('running: true のときログ領域と logLines の内容、キャンセルボタンが出る', async () => {
    const { onCancel } = renderScreen({
      running: true,
      status: 'running',
      logLines: ['[claude] planning...', '[claude] writing strategy.json'],
    })
    expect(screen.getByText(/planning\.\.\./)).toBeInTheDocument()
    expect(screen.getByText(/writing strategy\.json/)).toBeInTheDocument()
    const cancelButton = screen.getByRole('button', { name: /キャンセル/ })
    await userEvent.click(cancelButton)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  // 検証 5.5: 実行中ログはライブリージョンとして支援技術に通知される（issue #473）
  it('実行中のログ領域が log ロールのライブリージョンになっている', () => {
    renderScreen({
      running: true,
      status: 'running',
      logLines: ['[claude] planning...'],
    })
    // WHY: 実行は数分かかり、画面上の変化はログの追記だけ。ライブリージョンに
    // しないとスクリーンリーダー利用者には進行しているのか止まったのか分からない
    const log = screen.getByRole('log', { name: /ジョブログ/ })
    expect(log).toHaveAttribute('aria-live', 'polite')
    // 全文再読み上げを避けるため追記分のみを通知する（aria-atomic は false）
    expect(log).toHaveAttribute('aria-atomic', 'false')
  })

  // 検証 6: result.strategy_id があるとき /detail/<strategy_id> へのリンクが出る
  it('succeeded かつ result.strategy_id があるとき /detail/<strategy_id> へのリンクが出る', () => {
    renderScreen({ status: 'succeeded', result: { strategy_id: 'cl_hmm_bb_rsi_v1' } })
    const links = screen.getAllByRole('link')
    const detailLink = links.find((l) => l.getAttribute('href') === '/detail/cl_hmm_bb_rsi_v1')
    expect(detailLink).toBeDefined()
  })

  // 検証 6.5: result.summary の表示（issue #475）
  it('succeeded かつ result.summary があるとき、リンクと一緒に要約を表示する', () => {
    // WHY: エージェントは {strategy_id, run_id, summary} を返す契約だが、
    // 完了パネルはリンクしか出しておらず「何を作ったのか」が読み取れなかった
    renderScreen({
      status: 'succeeded',
      result: { strategy_id: 'cl_x', summary: 'RSI 逆張りに ATR フィルタを追加' },
    })
    expect(screen.getByText(/RSI 逆張りに ATR フィルタを追加/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /cl_x/ })).toBeInTheDocument()
  })

  it('summary が無いときは要約を出さずリンクだけを表示する', () => {
    renderScreen({ status: 'succeeded', result: { strategy_id: 'cl_x' } })
    expect(screen.getByRole('link', { name: /cl_x/ })).toBeInTheDocument()
    expect(screen.queryByTestId('develop-summary')).toBeNull()
  })

  it('strategy_id に URL 予約文字が含まれてもリンク先が壊れない', () => {
    // WHY: strategy_id はエージェント出力由来の未検証文字列。エンコードしないと
    // 別ルートへのリンクになり、GUI から成果物へ辿れなくなる
    renderScreen({ status: 'succeeded', result: { strategy_id: 'a/b?c' } })
    expect(screen.getByRole('link', { name: /a\/b\?c/ })).toHaveAttribute(
      'href',
      '/detail/a%2Fb%3Fc',
    )
  })

  it('succeeded だが result が無いとき、結果不明メッセージを表示する（silent fail 禁止）', () => {
    renderScreen({ status: 'succeeded', result: null })
    expect(screen.getByText(/結果を特定できませんでした/)).toBeInTheDocument()
  })

  it('succeeded だが result に strategy_id が無いとき、結果不明メッセージを表示する', () => {
    renderScreen({ status: 'succeeded', result: { note: 'no id here' } })
    expect(screen.getByText(/結果を特定できませんでした/)).toBeInTheDocument()
  })

  it('failed のとき error を表示する', () => {
    renderScreen({ status: 'failed', error: 'agent プロセスが異常終了しました' })
    expect(screen.getByText(/agent プロセスが異常終了しました/)).toBeInTheDocument()
  })

  // 検証 7: 日英切り替え
  it('lang: en のとき英語ラベルで表示する', () => {
    renderScreen({ lang: 'en' })
    expect(screen.getByText(/Agent Develop/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Start/ })).toBeInTheDocument()
  })

  it('lang: en で localhost 限定の案内も英語になる', () => {
    renderScreen({ lang: 'en', backends: { enabled: false, default_max_turns: 100, max_max_turns: 500, backends: [] } })
    expect(screen.getByText(/only available on localhost/)).toBeInTheDocument()
  })

  it('lang: en で succeeded だが result が無いときのメッセージも英語になる', () => {
    renderScreen({ lang: 'en', status: 'succeeded', result: null })
    expect(screen.getByText(/could not be determined/)).toBeInTheDocument()
  })
})

/**
 * issue #489: 自由文でゴールを書けない初中級者向けの選択式ビルダー。
 * ビルダー操作は共通のゴール textarea に文を書き込む（自由記述は常に可能）。
 */
describe('DevelopScreen ゴールビルダー (issue #489)', () => {
  it('戦略タイプを選ぶとゴール欄に文が組み上がる', async () => {
    renderScreen()
    await userEvent.selectOptions(
      screen.getByLabelText(/戦略タイプ/),
      'trend_following',
    )
    const goal = screen.getByLabelText(/ゴール/) as HTMLTextAreaElement
    expect(goal.value).toContain('トレンドフォロー')
    expect(goal.value).toContain('Sharpe')
  })

  it('指標をチェックすると文に指標名が入る', async () => {
    renderScreen()
    await userEvent.selectOptions(
      screen.getByLabelText(/戦略タイプ/),
      'mean_reversion',
    )
    await userEvent.click(screen.getByRole('checkbox', { name: 'RSI' }))
    const goal = screen.getByLabelText(/ゴール/) as HTMLTextAreaElement
    expect(goal.value).toContain('RSI')
  })

  it('組み上がった文を編集してから開始すると編集後の文が渡る', async () => {
    const { onStart } = renderScreen()
    await userEvent.selectOptions(
      screen.getByLabelText(/戦略タイプ/),
      'breakout',
    )
    const goal = screen.getByLabelText(/ゴール/)
    await userEvent.type(goal, ' 損切りは浅めにしてください。')
    await userEvent.click(screen.getByRole('button', { name: /開始/ }))
    expect(onStart).toHaveBeenCalled()
    const calledGoal = (onStart.mock.calls[0] as string[])[0]!
    expect(calledGoal).toContain('ブレイクアウト')
    expect(calledGoal).toContain('損切りは浅めに')
  })
})

/**
 * issue #490: AI が作った戦略を「作りっぱなし」で終わらせず、次の学習ステップ
 * （最適化 / Pine 出力 / 比較）へ繋ぐ。
 */
describe('CompletionPanel 次アクション導線 (issue #490)', () => {
  it('成功時に最適化・Pine 出力・比較への導線が出る', () => {
    renderScreen({
      running: false,
      status: 'succeeded',
      result: { strategy_id: 'new_strat', run_id: 'r1', summary: 'done' },
    })
    expect(
      screen.getByRole('link', { name: /最適化する/ }).getAttribute('href'),
    ).toBe('/detail/new_strat?tab=optimize')
    expect(
      screen.getByRole('link', { name: /Pine に出す/ }).getAttribute('href'),
    ).toBe('/detail/new_strat?tab=strategy')
    expect(
      screen.getByRole('link', { name: /比較に追加/ }).getAttribute('href'),
    ).toBe('/compare?ids=new_strat')
  })

  it('strategy_id が判明しない成功では次アクションを出さない', () => {
    renderScreen({ running: false, status: 'succeeded', result: null })
    expect(screen.queryByRole('link', { name: /最適化する/ })).toBeNull()
  })
})

/**
 * issue #491: 既存戦略を起点にした AI 派生開発。/develop?base=<id> で開くと
 * 派生元バナーが出て、完了後の比較導線が「元 vs 新」になる。
 */
describe('DevelopScreen 派生開発 (issue #491)', () => {
  it('baseStrategyId があると派生元バナーを表示する', () => {
    renderScreen({ baseStrategyId: 'base_s1' })
    expect(screen.getByText(/base_s1/)).toBeInTheDocument()
    expect(screen.getByText(/改善版/)).toBeInTheDocument()
  })

  it('派生の完了パネルは元戦略との比較リンクになる', () => {
    renderScreen({
      baseStrategyId: 'base_s1',
      running: false,
      status: 'succeeded',
      result: { strategy_id: 'base_s1_v2', run_id: 'r1', summary: 'done' },
    })
    expect(
      screen.getByRole('link', { name: /比較/ }).getAttribute('href'),
    ).toBe('/compare?ids=base_s1%2Cbase_s1_v2')
  })

  it('baseStrategyId が無ければバナーは出ない', () => {
    renderScreen()
    expect(screen.queryByText(/改善版/)).toBeNull()
  })
})
