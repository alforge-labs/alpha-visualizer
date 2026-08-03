import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, it, expect, vi } from 'vitest'
import type { AgentBackendsResponse } from '../../api/types'
import type { DevelopScreenProps } from '../DevelopScreen'
import { DevelopScreen } from '../DevelopScreen'

const BOTH_AVAILABLE: AgentBackendsResponse = {
  enabled: true,
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

describe('<DevelopScreen />', () => {
  // 検証 0: SettingsToggles（言語切替 UI）がレンダリングされる（他画面は個別に
  // レンダリングしているが Develop 画面だけ欠落していた不具合の再発防止）
  it('SettingsToggles（言語切替 UI）がレンダリングされ、クリックで onSetLang が呼ばれる', async () => {
    const { onSetLang } = renderScreen()
    const enToggle = screen.getByRole('radio', { name: /English/ })
    await userEvent.click(enToggle)
    expect(onSetLang).toHaveBeenCalledWith('en')
  })

  // 検証 1: backends.enabled === false → localhost 限定の案内が出てフォームが出ない
  it('backends.enabled が false のとき localhost 限定の案内が出てフォームが出ない', () => {
    renderScreen({ backends: { enabled: false, backends: [] } })
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
        enabled: true,
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
        enabled: true,
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
    expect(onStart).toHaveBeenCalledWith('CL=F の勝率を改善したい', '', 'claude')
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

  // 検証 6: result.strategy_id があるとき /detail/<strategy_id> へのリンクが出る
  it('succeeded かつ result.strategy_id があるとき /detail/<strategy_id> へのリンクが出る', () => {
    renderScreen({ status: 'succeeded', result: { strategy_id: 'cl_hmm_bb_rsi_v1' } })
    const links = screen.getAllByRole('link')
    const detailLink = links.find((l) => l.getAttribute('href') === '/detail/cl_hmm_bb_rsi_v1')
    expect(detailLink).toBeDefined()
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
    renderScreen({ lang: 'en', backends: { enabled: false, backends: [] } })
    expect(screen.getByText(/only available on localhost/)).toBeInTheDocument()
  })

  it('lang: en で succeeded だが result が無いときのメッセージも英語になる', () => {
    renderScreen({ lang: 'en', status: 'succeeded', result: null })
    expect(screen.getByText(/could not be determined/)).toBeInTheDocument()
  })
})
