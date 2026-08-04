import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../api/client', () => ({
  api: { generatePine: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number
    url: string
    constructor(message: string, status: number, url: string) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.url = url
    }
  },
}))
vi.mock('../../../lib/download', () => ({ downloadTextFile: vi.fn() }))

import { api } from '../../../api/client'
import { ApiError } from '../../../api/client'
import { downloadTextFile } from '../../../lib/download'
import { PineExportCard } from '../PineExportCard'

const PINE = {
  strategy_id: 'sma_v1',
  filename: 'sma_v1.pine',
  script: '//@version=6\nstrategy("sma_v1", overlay=true)\n',
}

beforeEach(() => {
  vi.mocked(api.generatePine).mockReset()
  vi.mocked(downloadTextFile).mockReset()
})

function renderCard() {
  return render(<PineExportCard strategyId="sma_v1" lang="ja" />)
}

/**
 * issue #487: Pine 出力は AlphaForge の看板機能だが GUI から一切触れなかった。
 * 生成 → プレビュー → コピー / ダウンロードを Detail 画面から完結させる。
 */
describe('PineExportCard (issue #487)', () => {
  it('生成すると Pine 本文のプレビューとコピー・ダウンロード導線が出る', async () => {
    vi.mocked(api.generatePine).mockResolvedValue(PINE as never)
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: /Pine Script を生成/ }))
    expect(await screen.findByText(/\/\/@version=6/)).toBeInTheDocument()
    expect(api.generatePine).toHaveBeenCalledWith('sma_v1')
    expect(screen.getByRole('button', { name: /コピー/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ダウンロード/ })).toBeInTheDocument()
  })

  it('ダウンロードは CLI と同じファイル名規約で保存する', async () => {
    vi.mocked(api.generatePine).mockResolvedValue(PINE as never)
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Pine Script を生成/ }))
    await screen.findByText(/\/\/@version=6/)

    fireEvent.click(screen.getByRole('button', { name: /ダウンロード/ }))
    expect(downloadTextFile).toHaveBeenCalledWith('sma_v1.pine', PINE.script)
  })

  it('コピーはクリップボードへ Pine 本文を書き込む', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    vi.mocked(api.generatePine).mockResolvedValue(PINE as never)
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Pine Script を生成/ }))
    await screen.findByText(/\/\/@version=6/)

    fireEvent.click(screen.getByRole('button', { name: /コピー/ }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(PINE.script))
    vi.unstubAllGlobals()
  })

  it('生成失敗はサーバー detail を表示する（Trial の有料プラン案内など）', async () => {
    vi.mocked(api.generatePine).mockRejectedValue(
      new ApiError(
        'API 500: {"detail":"forge が異常終了しました（exit 1）: Pine Script エクスポートは有料プランのみ利用できます"}',
        500,
        '/api/pine/sma_v1',
      ),
    )
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Pine Script を生成/ }))

    const alert = await waitFor(() => screen.getByRole('alert'))
    expect(alert.textContent).toContain('有料プラン')
  })
})
