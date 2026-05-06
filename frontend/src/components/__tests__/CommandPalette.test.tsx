import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { StrategyListItem } from '../../api/types'
import { CommandPalette } from '../CommandPalette'

vi.mock('../../api/client', () => ({
  api: {
    listStrategies: vi.fn(),
  },
}))

import { api } from '../../api/client'

const ITEMS: StrategyListItem[] = [
  { strategy_id: 'ema_cross', name: 'EMA クロス AAPL', symbol: 'AAPL', tags: ['trend'] },
  { strategy_id: 'rsi_dip', name: 'RSI ディップ', symbol: 'TQQQ', tags: ['mean_reversion', 'rsi'] },
  { strategy_id: 'hmm_v1', name: 'HMM レジーム', symbol: 'SPY', target_symbols: ['SPY'] },
]

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(api.listStrategies).mockResolvedValue(ITEMS)
  vi.stubGlobal('localStorage', createMemoryStorage())
})

function PathProbe() {
  const location = useLocation()
  return <div data-testid="path">{location.pathname + location.search}</div>
}

function renderPalette(open: boolean, onClose: () => void = () => undefined) {
  return render(
    <MemoryRouter initialEntries={['/browse']}>
      <CommandPalette open={open} onClose={onClose} lang="ja" />
      <Routes>
        <Route path="*" element={<PathProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('CommandPalette', () => {
  it('does not render when closed', () => {
    renderPalette(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders a labelled dialog when open', async () => {
    renderPalette(true)
    await flushAsync()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog.getAttribute('aria-label')).toBeTruthy()
  })

  it('debounces the input and shows filtered results', async () => {
    renderPalette(true)
    await flushAsync()

    // 初期表示は recent + 全件（buildInitialResults）。
    expect(screen.getByText('EMA クロス AAPL')).toBeInTheDocument()
    expect(screen.getByText('RSI ディップ')).toBeInTheDocument()

    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'rsi' } })

    // Before debounce flush — 初期表示の EMA もまだ消えていない
    expect(screen.getByText('EMA クロス AAPL')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(200)
    })

    // debounce 経過後は rsi に絞られ EMA は消える
    expect(screen.getByText('RSI ディップ')).toBeInTheDocument()
    expect(screen.queryByText('EMA クロス AAPL')).toBeNull()
  })

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn()
    renderPalette(true, onClose)
    await flushAsync()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is clicked', async () => {
    const onClose = vi.fn()
    renderPalette(true, onClose)
    await flushAsync()

    const backdrop = screen.getByTestId('command-palette-backdrop')
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('navigates to the detail page when a result is clicked and records it', async () => {
    const onClose = vi.fn()
    renderPalette(true, onClose)
    await flushAsync()

    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'rsi' } })
    await act(async () => {
      vi.advanceTimersByTime(200)
    })

    const option = screen.getByRole('option', { name: /RSI ディップ/ })
    await act(async () => {
      fireEvent.click(option)
    })

    expect(onClose).toHaveBeenCalled()
    expect(screen.getByTestId('path').textContent).toContain('/detail/rsi_dip')

    // Clicking a result records it in recent history.
    const stored = globalThis.localStorage.getItem('alphaforge.recent_strategies.v1')
    expect(stored).toBeTruthy()
    const parsed = JSON.parse(stored as string) as Array<{ strategy_id: string }>
    expect(parsed[0]?.strategy_id).toBe('rsi_dip')
  })

  it('navigates to the highlighted result when Enter is pressed', async () => {
    renderPalette(true)
    await flushAsync()

    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'hmm' } })
    await act(async () => {
      vi.advanceTimersByTime(200)
    })

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    expect(screen.getByTestId('path').textContent).toContain('/detail/hmm_v1')
  })

  it('moves the highlighted index with ArrowDown / ArrowUp', async () => {
    renderPalette(true)
    await flushAsync()

    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'a' } })
    await act(async () => {
      vi.advanceTimersByTime(200)
    })

    const options = screen.getAllByRole('option')
    expect(options.length).toBeGreaterThan(1)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const updated = screen.getAllByRole('option')
    expect(updated[1]).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    const reverted = screen.getAllByRole('option')
    expect(reverted[0]).toHaveAttribute('aria-selected', 'true')
  })
})
