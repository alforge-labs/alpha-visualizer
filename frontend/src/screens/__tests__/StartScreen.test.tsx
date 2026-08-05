import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { SetupStatusResponse } from '../../api/types'
import { StartScreen } from '../StartScreen'

/** issue #492: 「はじめる」画面。5 チェックの状態別に正しい次の一手を出す。 */

const ALL_OK: SetupStatusResponse = {
  ready: true,
  cli: { status: 'ok', version: '1.3.0' },
  eula: { status: 'ok' },
  workspace: { status: 'ok', config_path: '~/ws/forge.yaml' },
  auth: { status: 'ok', logged_in: true, plan_type: 'paid' },
  data: { status: 'ok', count: 3 },
}

function renderScreen(overrides: Partial<SetupStatusResponse> = {}, opts?: {
  loading?: boolean
  error?: string | null
}) {
  const status: SetupStatusResponse = { ...ALL_OK, ...overrides, ready: overrides.ready ?? false }
  const onRetry = vi.fn()
  render(
    <MemoryRouter>
      <StartScreen
        lang="ja"
        theme="light"
        status={opts?.loading || opts?.error ? null : status}
        loading={opts?.loading ?? false}
        error={opts?.error ?? null}
        onRetry={onRetry}
        onSetLang={() => {}}
        onSetTheme={() => {}}
      />
    </MemoryRouter>,
  )
  return { onRetry }
}

describe('StartScreen (issue #492)', () => {
  it('全チェック ok なら準備完了バナーと次の導線を出す', () => {
    renderScreen({ ready: true })
    expect(screen.getByText(/準備完了/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /AI で戦略を作ってみる/ }).getAttribute('href'),
    ).toBe('/develop')
    // 完了項目にもバージョン等の詳細は残す
    expect(screen.getByText(/v1\.3\.0/)).toBeInTheDocument()
  })

  it('CLI 未導入はインストール導線を出す', () => {
    renderScreen({
      cli: { status: 'attention', version: null },
      eula: { status: 'unknown' },
      workspace: { status: 'unknown', config_path: null },
      auth: { status: 'unknown', logged_in: null, plan_type: null },
      data: { status: 'unknown', count: null },
    })
    expect(screen.getByText(/alpha-forge コマンドが見つかりません/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /インストールガイド/ }).getAttribute('href'),
    ).toContain('alforgelabs.com')
    expect(screen.queryByText(/準備完了/)).not.toBeInTheDocument()
  })

  it('EULA 未同意はターミナルでのコマンド実行を案内する（GUI から同意させない）', () => {
    renderScreen({ eula: { status: 'attention' } })
    expect(screen.getByText('alpha-forge system doctor')).toBeInTheDocument()
    expect(screen.getByText(/この画面からは同意できません/)).toBeInTheDocument()
  })

  it('workspace 未解決は system init の案内を出す', () => {
    renderScreen({ workspace: { status: 'attention', config_path: null } })
    expect(screen.getByText('alpha-forge system init')).toBeInTheDocument()
  })

  it('未ログインは auth login コマンドを案内する（GUI から起動しない）', () => {
    renderScreen({ auth: { status: 'attention', logged_in: false, plan_type: null } })
    expect(screen.getByText('alpha-forge system auth login')).toBeInTheDocument()
  })

  it('データゼロはデータ画面への導線を出す', () => {
    renderScreen({ data: { status: 'attention', count: 0 } })
    expect(
      screen.getByRole('link', { name: /データ画面で取得する/ }).getAttribute('href'),
    ).toBe('/data')
  })

  it('1 項目が unknown でも他のチェックは表示される（degraded）', () => {
    renderScreen({ data: { status: 'unknown', count: null } })
    expect(screen.getByText(/確認できませんでした/)).toBeInTheDocument()
    // 他の ok 項目は無傷
    expect(screen.getByText(/v1\.3\.0/)).toBeInTheDocument()
  })

  it('読み込み中はチェックリストを出さない', () => {
    renderScreen({}, { loading: true })
    expect(screen.getByText(/読み込み中/)).toBeInTheDocument()
    expect(screen.queryByText(/AlphaForge CLI/)).not.toBeInTheDocument()
  })

  it('取得エラーは再試行できる', () => {
    renderScreen({}, { error: 'network_error' })
    const retry = screen.getByRole('button', { name: /再試行/ })
    retry.click()
  })
})
