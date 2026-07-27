import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MaintenanceScreen } from '../MaintenanceScreen'
import type { OrphanRunItem } from '../../api/types'

const ORPHANS: OrphanRunItem[] = [
  {
    strategy_id: 'lev_tmp',
    backtest_run_count: 20,
    optimization_run_count: 0,
    bytes: 5856500,
    first_run_at: '2026-06-08T14:05:30+00:00',
    last_run_at: '2026-06-08T14:07:20+00:00',
  },
  {
    strategy_id: 'a158_sma_base',
    backtest_run_count: 1,
    optimization_run_count: 2,
    bytes: 1024,
    first_run_at: '2026-05-11T00:00:00+00:00',
    last_run_at: '2026-05-12T00:00:00+00:00',
  },
]

function baseProps() {
  return {
    orphans: ORPHANS,
    totalBytes: 5857524,
    loading: false,
    error: null,
    onRetry: vi.fn(),
    selectedIds: [] as string[],
    onToggleId: vi.fn(),
    onSelectAll: vi.fn(),
    onClearSelection: vi.fn(),
    onDelete: vi.fn(),
    deleting: false,
    result: null,
    lang: 'ja' as const,
  }
}

describe('<MaintenanceScreen />', () => {
  it('既定では 1 件も選択されていない', () => {
    render(<MaintenanceScreen {...baseProps()} />)
    for (const box of screen.getAllByRole('checkbox')) {
      expect(box).not.toBeChecked()
    }
  })

  it('選択 0 件では削除ボタンが無効', () => {
    render(<MaintenanceScreen {...baseProps()} />)
    expect(screen.getByRole('button', { name: /削除/ })).toBeDisabled()
  })

  it('選択件数と合計容量がボタンに出る', () => {
    render(<MaintenanceScreen {...baseProps()} selectedIds={['lev_tmp']} />)
    const button = screen.getByRole('button', { name: /削除/ })
    expect(button).toBeEnabled()
    expect(button.textContent).toContain('1')
    // 5856500 B = 5.6 MB
    expect(button.textContent).toContain('5.6')
  })

  it('チェックボックスのクリックで onToggleId が呼ばれる', async () => {
    const props = baseProps()
    render(<MaintenanceScreen {...props} />)
    const row = screen.getByText('lev_tmp').closest('tr')
    if (!row) throw new Error('lev_tmp の行が無い')
    await userEvent.click(within(row).getByRole('checkbox'))
    expect(props.onToggleId).toHaveBeenCalledWith('lev_tmp')
  })

  it('孤児 0 件のとき空状態を出し、表を描かない', () => {
    render(<MaintenanceScreen {...baseProps()} orphans={[]} totalBytes={0} />)
    expect(screen.getByText(/孤児の実行結果はありません/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('エラーを表示する', () => {
    render(<MaintenanceScreen {...baseProps()} error="forge コマンドが見つかりません" />)
    expect(screen.getByText(/forge コマンドが見つかりません/)).toBeInTheDocument()
  })

  it('エラー時に再試行ボタンが出て、押すと onRetry が呼ばれる', async () => {
    // 一覧取得の失敗はユーザーが最も遭遇しやすい失敗ケース。ページ全体の
    // リロードに頼らず、その場で再試行できる導線が必須。
    const props = baseProps()
    render(<MaintenanceScreen {...props} error="forge コマンドが見つかりません" />)

    const retryButton = screen.getByRole('button', { name: /再試行/ })
    await userEvent.click(retryButton)
    expect(props.onRetry).toHaveBeenCalledTimes(1)
  })

  it('エラーがあるときは「孤児の実行結果はありません」を出さない', () => {
    // 取得失敗による 0 件と、本当に 0 件なのを混同させない
    // （forge 未導入時にまさにこの状況が起きる）。
    render(
      <MaintenanceScreen
        {...baseProps()}
        orphans={[]}
        totalBytes={0}
        error="forge コマンドが見つかりません"
      />,
    )
    expect(screen.queryByText(/孤児の実行結果はありません/)).toBeNull()
  })

  it('削除中はボタンを無効にする', () => {
    render(<MaintenanceScreen {...baseProps()} selectedIds={['lev_tmp']} deleting />)
    expect(screen.getByRole('button', { name: /削除/ })).toBeDisabled()
  })

  it('削除結果に回収容量を出す', () => {
    render(
      <MaintenanceScreen
        {...baseProps()}
        orphans={[]}
        result={{
          deletedCount: 2,
          deletedBacktestRows: 21,
          deletedOptimizationRows: 2,
          reclaimedBytes: 6000000,
          vacuumError: null,
        }}
      />,
    )
    expect(screen.getByText(/5\.7 MB/)).toBeInTheDocument()
  })

  it('VACUUM 失敗時は削除の成功と分けて伝える', () => {
    render(
      <MaintenanceScreen
        {...baseProps()}
        orphans={[]}
        result={{
          deletedCount: 1,
          deletedBacktestRows: 20,
          deletedOptimizationRows: 0,
          reclaimedBytes: 0,
          vacuumError: 'database is locked',
        }}
      />,
    )
    // 削除できたことは伝える
    expect(screen.getByText(/20/)).toBeInTheDocument()
    // 容量回収が失敗したことも伝える
    expect(screen.getByText(/--vacuum/)).toBeInTheDocument()
  })

  it('全選択ボタンで onSelectAll が呼ばれる', async () => {
    const props = baseProps()
    render(<MaintenanceScreen {...props} />)
    await userEvent.click(screen.getByRole('button', { name: /すべて選択/ }))
    expect(props.onSelectAll).toHaveBeenCalled()
  })

  it('削除ボタンを押すと確認を挟み、承認するまで onDelete を呼ばない', async () => {
    // 不可逆な操作なので、1 クリックで実行されてはならない
    const props = baseProps()
    render(<MaintenanceScreen {...props} selectedIds={['lev_tmp']} />)

    await userEvent.click(screen.getByRole('button', { name: /削除/ }))
    expect(props.onDelete).not.toHaveBeenCalled()

    const dialog = screen.getByRole('dialog')
    // 確認には件数・容量・元に戻せないことが出る
    expect(dialog.textContent).toContain('1')
    expect(dialog.textContent).toContain('5.6')
    expect(dialog.textContent).toMatch(/元に戻せません/)

    await userEvent.click(within(dialog).getByRole('button', { name: /削除する/ }))
    expect(props.onDelete).toHaveBeenCalledTimes(1)
  })

  it('確認をキャンセルすると onDelete を呼ばない', async () => {
    const props = baseProps()
    render(<MaintenanceScreen {...props} selectedIds={['lev_tmp']} />)

    await userEvent.click(screen.getByRole('button', { name: /削除/ }))
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /キャンセル/ }),
    )

    expect(props.onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
