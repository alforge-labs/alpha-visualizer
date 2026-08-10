import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
