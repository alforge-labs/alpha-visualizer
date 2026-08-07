import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LiveRefreshPanel } from '../LiveRefreshPanel'

describe('LiveRefreshPanel', () => {
  it('ボタン押下で onStart が呼ばれる', () => {
    const onStart = vi.fn()
    render(
      <LiveRefreshPanel
        lang="ja"
        running={false}
        logLines={[]}
        status={null}
        error={null}
        onStart={onStart}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'ライブデータを更新' }))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('実行中はボタンが disabled でログ末尾が表示される', () => {
    render(
      <LiveRefreshPanel
        lang="ja"
        running={true}
        logLines={['[1/3] sync-events: 同期中...', '[2/3] data update: 市場データ更新中...']}
        status="running"
        error={null}
        onStart={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'ライブデータを更新' })).toBeDisabled()
    expect(screen.getByText(/data update/)).toBeInTheDocument()
  })

  it('失敗時はエラーを表示する', () => {
    render(
      <LiveRefreshPanel
        lang="ja"
        running={false}
        logLines={[]}
        status="failed"
        error="ステップ sync_events が失敗しました"
        onStart={vi.fn()}
      />,
    )
    expect(screen.getByText(/sync_events/)).toBeInTheDocument()
  })
})
