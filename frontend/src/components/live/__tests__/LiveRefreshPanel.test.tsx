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
        onCancel={vi.fn()}
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
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'ライブデータを更新' })).toBeDisabled()
    expect(screen.getByText(/data update/)).toBeInTheDocument()
  })

  // PR #506 最終レビュー指摘 #3: sync-events（SSH rsync）がトンネル障害で
  // ブロックすると DEFAULT_JOB_TIMEOUT_SEC（既定 1 時間）までボタンが
  // disabled のままになるため、キャンセル手段が必須。
  it('実行中はキャンセルボタンが表示され、押下で onCancel が呼ばれる', () => {
    const onCancel = vi.fn()
    render(
      <LiveRefreshPanel
        lang="ja"
        running={true}
        logLines={[]}
        status="running"
        error={null}
        onStart={vi.fn()}
        onCancel={onCancel}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('未実行時はキャンセルボタンを表示しない', () => {
    render(
      <LiveRefreshPanel
        lang="ja"
        running={false}
        logLines={[]}
        status={null}
        error={null}
        onStart={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'キャンセル' })).toBeNull()
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
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/sync_events/)).toBeInTheDocument()
  })

  // PR #506 最終レビュー指摘 #1: ジョブ「作成」自体の失敗（403 / 503 / 429）は
  // start() の catch で setError するだけで status は変わらない
  // （null のまま）。表示条件が `error` の有無のみであることを直接検証する。
  it('status が null でも error があればエラーを表示する（ジョブ作成失敗の経路）', () => {
    render(
      <LiveRefreshPanel
        lang="ja"
        running={false}
        logLines={[]}
        status={null}
        error='API 403: {"detail":"この操作は localhost でのみ利用できます / localhost only","code":"local_write_disabled"}'
        onStart={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/localhost/)).toBeInTheDocument()
  })

  // PR #506 最終レビュー指摘 #2: job_state_lost は JobRunnerCard /
  // TuningPanel と同じ利用者向け文言へ写像する（生の識別子を出さない）。
  it('job_state_lost は「ジョブの状態が不明」文言に写像する', () => {
    render(
      <LiveRefreshPanel
        lang="ja"
        running={false}
        logLines={[]}
        status="failed"
        error="job_state_lost"
        onStart={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/ジョブの状態が不明になりました/)).toBeInTheDocument()
    expect(screen.queryByText('job_state_lost')).toBeNull()
  })
})
