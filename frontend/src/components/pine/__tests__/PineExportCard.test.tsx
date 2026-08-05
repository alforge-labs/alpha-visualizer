import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../api/client', () => ({
  api: { generatePine: vi.fn(), getPineSupport: vi.fn() },
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

const SUPPORT_OK = {
  strategy_id: 'sma_v1',
  indicators: [{ id: 'sma_fast', type: 'SMA', pine_supported: true }],
  unsupported_types: [],
  all_unsupported: false,
}

beforeEach(() => {
  vi.mocked(api.generatePine).mockReset()
  vi.mocked(api.getPineSupport).mockReset().mockResolvedValue(SUPPORT_OK as never)
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

/**
 * issue #488: Pine 出力まわりで初中級者が最も混乱する 2 点を予防する:
 * 「TradingView で動きが違う」（非対応指標の na 化）と「押したのにエラー」
 * （Trial の entitlement）。生成前の警告と生成後の貼り付けガイドを足す。
 */
describe('PineExportCard 事前警告とガイド (issue #488)', () => {
  it('非対応指標があると生成前に警告リストが出る', async () => {
    vi.mocked(api.getPineSupport).mockResolvedValue({
      strategy_id: 'sma_v1',
      indicators: [
        { id: 'sma_fast', type: 'SMA', pine_supported: true },
        { id: 'kama_1', type: 'KAMA', pine_supported: false },
      ],
      unsupported_types: ['KAMA'],
      all_unsupported: false,
    } as never)
    renderCard()

    expect(await screen.findByText(/KAMA/)).toBeInTheDocument()
    expect(screen.getByText(/Pine 非対応/)).toBeInTheDocument()
    // 依存条件がエントリーしなくなることまで伝える
    expect(screen.getByText(/エントリーしません/)).toBeInTheDocument()
  })

  it('全指標が非対応なら「機能しない」ことを強く警告する', async () => {
    vi.mocked(api.getPineSupport).mockResolvedValue({
      strategy_id: 'sma_v1',
      indicators: [{ id: 'kama_1', type: 'KAMA', pine_supported: false }],
      unsupported_types: ['KAMA'],
      all_unsupported: true,
    } as never)
    renderCard()

    expect(await screen.findByText(/すべて Pine 非対応/)).toBeInTheDocument()
    expect(screen.getByText(/機能しません/)).toBeInTheDocument()
  })

  it('対応チェックに失敗しても警告なしで生成は使える（縮退）', async () => {
    vi.mocked(api.getPineSupport).mockRejectedValue(new Error('boom'))
    vi.mocked(api.generatePine).mockResolvedValue(PINE as never)
    renderCard()

    const button = screen.getByRole('button', { name: /Pine Script を生成/ })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(await screen.findByText(/\/\/@version=6/)).toBeInTheDocument()
    expect(screen.queryByText(/Pine 非対応/)).toBeNull()
  })

  it('生成成功後に TradingView への貼り付けガイドが出る', async () => {
    vi.mocked(api.generatePine).mockResolvedValue(PINE as never)
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: /Pine Script を生成/ }))
    await screen.findByText(/\/\/@version=6/)
    // ガイドは番号付きリスト。文言はカード説明文（「Pine エディタに貼り付け」）
    // と重複するため、手順固有の文言で検証する
    expect(screen.getByText(/画面下部の「Pine エディタ」を開く/)).toBeInTheDocument()
    expect(screen.getByText(/「チャートに追加」を押す/)).toBeInTheDocument()
  })
})
