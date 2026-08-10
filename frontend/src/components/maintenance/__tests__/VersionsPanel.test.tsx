import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VersionsPanel } from '../VersionsPanel'
import type { ComponentVersion } from '../../../api/types'

const forgeOutdated: ComponentVersion = {
  id: 'forge', status: 'ok', current: '1.9.2', latest: '1.9.3',
  update_available: true, updatable: true, message: null, as_of: null,
}
const visLatest: ComponentVersion = {
  id: 'visualizer', status: 'ok', current: '1.6.0', latest: '1.6.0',
  update_available: false, updatable: true, message: null, as_of: null,
}
const strikeOk: ComponentVersion = {
  id: 'strike', status: 'ok', current: '1.0.4', latest: '1.0.5',
  update_available: true, updatable: false, message: null,
  as_of: '2026-08-10T09:12:00+09:00',
}
const strikeUnknown: ComponentVersion = {
  id: 'strike', status: 'unknown', current: null, latest: '1.0.5',
  update_available: false, updatable: false,
  message: '`alpha-forge live sync-events` を実行すると…', as_of: null,
}
const strikeDisabled: ComponentVersion = {
  id: 'strike', status: 'disabled', current: null, latest: null,
  update_available: false, updatable: false, message: null, as_of: null,
}

const strikeUnknownWithCode: ComponentVersion = {
  id: 'strike', status: 'unknown', current: null, latest: '1.0.5',
  update_available: false, updatable: false,
  // サーバーの message は curl 利用者向けの日英連結
  message:
    '`alpha-forge live sync-events` を実行すると alpha-strike のバージョンが表示されます'
    + ' / Run `alpha-forge live sync-events` to show the alpha-strike version',
  code: 'strike_not_synced', as_of: null,
}

describe('VersionsPanel', () => {
  it('現在版と最新版を並べて表示する', () => {
    render(<VersionsPanel components={[forgeOutdated, visLatest]} loading={false} error={null} lang="ja" />)
    expect(screen.getByText('1.9.2')).toBeInTheDocument()
    expect(screen.getByText('1.9.3')).toBeInTheDocument()
  })

  it('disabled のコンポーネントは行ごと表示しない', () => {
    render(<VersionsPanel components={[visLatest, strikeDisabled]} loading={false} error={null} lang="ja" />)
    expect(screen.queryByText('alpha-strike')).not.toBeInTheDocument()
  })

  it('unknown は「不明」と message を出す', () => {
    render(<VersionsPanel components={[strikeUnknown]} loading={false} error={null} lang="ja" />)
    // 「現在」列・「状態」列の両方が「不明」になりうるため getAllByText で受ける
    // （current: null は不明表示、update_available=false かつ status!=='ok' も不明表示）
    expect(screen.getAllByText(/不明/).length).toBeGreaterThan(0)
    expect(screen.getByText(/sync-events/)).toBeInTheDocument()
  })

  it('strike は current が最終同期時点であることを as_of で示す', () => {
    // リアルタイム値だと誤認させないことが、この列の存在理由
    render(<VersionsPanel components={[strikeOk]} loading={false} error={null} lang="ja" />)
    expect(screen.getByText(/2026-08-10/)).toBeInTheDocument()
  })

  it('update_available かつ updatable の行にだけ更新ボタンを出す', () => {
    const onUpdate = vi.fn()
    render(
      <VersionsPanel
        components={[forgeOutdated, visLatest, strikeOk]}
        loading={false} error={null} lang="ja" onUpdate={onUpdate}
      />,
    )
    // forge のみ（visualizer は最新、strike は updatable:false）
    expect(screen.getAllByRole('button', { name: /更新/ })).toHaveLength(1)
  })

  it('strike には更新ボタンの代わりに手順への導線を出す', () => {
    render(
      <VersionsPanel
        components={[strikeOk]} loading={false} error={null} lang="ja" onUpdate={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /更新/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link')).toBeInTheDocument()
  })

  it('エラー時に再試行ボタンが描画され、押すと onRetry が呼ばれる', async () => {
    // ErrorBanner は onRetry が渡らないとボタン自体を描画しない
    // （design/primitives/ErrorBanner.tsx の {onRetry && (...)}）。
    // VersionsPanel が onRetry を ErrorBanner に配線し忘れると、再試行ボタンが
    // 一度も出ずページ全体のリロードしか手段がなくなる回帰を防ぐ。
    const onRetry = vi.fn()
    render(
      <VersionsPanel
        components={[]} loading={false} error="API 500" lang="ja" onRetry={onRetry}
      />,
    )
    const retryButton = screen.getByRole('button', { name: /再試行/ })
    await userEvent.click(retryButton)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('英語表示では日英連結ではなく英語の案内だけを出す', () => {
    // サーバーの message をそのまま出すと英語ユーザーに日本語が先に見える。
    // code から表示言語の文言へ写像するのがこのリポジトリの規約（issue #358）
    render(
      <VersionsPanel components={[strikeUnknownWithCode]} loading={false} error={null} lang="en" />,
    )
    expect(
      screen.getByText('Run `alpha-forge live sync-events` to show the alpha-strike version'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/バージョンが表示されます/)).not.toBeInTheDocument()
  })

  it('日本語表示では日本語の案内だけを出す', () => {
    render(
      <VersionsPanel components={[strikeUnknownWithCode]} loading={false} error={null} lang="ja" />,
    )
    expect(
      screen.getByText(
        '`alpha-forge live sync-events` を実行すると alpha-strike のバージョンが表示されます',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/to show the alpha-strike version/)).not.toBeInTheDocument()
  })

  it('未知の code はサーバーの message へフォールバックする', () => {
    // サーバーが新しい code を先に返し始めても表示が消えないこと
    const unknownCode: ComponentVersion = { ...strikeUnknownWithCode, code: 'brand_new_code' }
    render(<VersionsPanel components={[unknownCode]} loading={false} error={null} lang="en" />)
    expect(screen.getByText(/Run `alpha-forge live sync-events`/)).toBeInTheDocument()
  })

  it('EULA 未同意は同意コマンドを案内する', () => {
    // self update 直後に必ず通る経路。「不明」だけでは次の一歩が分からない
    const forgeEula: ComponentVersion = {
      id: 'forge', status: 'unknown', current: null, latest: null,
      update_available: false, updatable: false,
      message: 'EULA に同意していないため実行できません / EULA has not been accepted',
      code: 'forge_eula_not_accepted', as_of: null,
    }
    render(<VersionsPanel components={[forgeEula]} loading={false} error={null} lang="ja" />)
    expect(screen.getByText(/alpha-forge system doctor/)).toBeInTheDocument()
  })
})
