import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { clearNavMemory, navMemoryPath, useNavMemory } from '../useNavMemory'

/**
 * issue #481: ナビのタブを往復すると絞り込み・比較対象が消えていた。
 *
 * ここで守りたいのは「タブを離れても、戻ってきたら続きから作業できる」こと。
 * 単に sessionStorage を読み書きしているかではなく、遷移をまたいで復元先が
 * 正しく解決されるかを検証する。
 */

const PATHS: readonly string[] = ['/browse', '/compare']

function Probe(): React.ReactElement {
  const resolvePath = useNavMemory(PATHS)
  const navigate = useNavigate()
  return (
    <div>
      <span data-testid="browse">{resolvePath('/browse')}</span>
      <span data-testid="compare">{resolvePath('/compare')}</span>
      <button onClick={() => navigate('/compare')}>go-compare</button>
      <button onClick={() => navigate('/detail/x?tab=trades')}>go-detail</button>
    </div>
  )
}

function renderAt(entry: string): void {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Probe />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  sessionStorage.clear()
})

describe('useNavMemory (issue #481)', () => {
  it('restores the params of a section left earlier', () => {
    renderAt('/browse?q=sma&sort=name&compare=a,b')
    fireEvent.click(screen.getByText('go-compare'))

    // 比較タブに移っても、ブラウズの絞り込みと比較トレイは復元先に残る
    expect(screen.getByTestId('browse')).toHaveTextContent(
      '/browse?q=sma&sort=name&compare=a,b',
    )
  })

  it('resolves the current section from the live location, not from storage', () => {
    // 記憶の書き込みは effect なので、storage 経由だと同じ render で
    // 1 手前の params を返してしまう。現在地は location から解くこと。
    renderAt('/compare?ids=a,b')
    expect(screen.getByTestId('compare')).toHaveTextContent('/compare?ids=a,b')
  })

  it('falls back to the bare path for a section never visited', () => {
    renderAt('/browse?q=sma')
    expect(screen.getByTestId('compare')).toHaveTextContent('/compare')
  })

  it('does not memorize paths outside the given list', () => {
    renderAt('/browse?q=sma')
    fireEvent.click(screen.getByText('go-detail'))

    // /detail は記憶対象外。戦略ごとの params で storage を汚さない
    expect(sessionStorage.getItem('alphaforge.nav:/detail/x')).toBeNull()
    expect(screen.getByTestId('browse')).toHaveTextContent('/browse?q=sma')
  })

  it('drops the memory of a section when cleared', () => {
    renderAt('/compare?ids=a,b')
    clearNavMemory('/compare')
    expect(navMemoryPath('/compare')).toBe('/compare')
  })

  it('falls back to the bare path when sessionStorage is unavailable', () => {
    // Safari のプライベートモードや容量超過。復元できないだけで、
    // 遷移そのものは壊れてはいけない。
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    try {
      expect(navMemoryPath('/browse')).toBe('/browse')
    } finally {
      spy.mockRestore()
    }
  })

  it('survives a write failure without breaking the render', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    try {
      renderAt('/browse?q=sma')
      expect(screen.getByTestId('browse')).toHaveTextContent('/browse?q=sma')
    } finally {
      spy.mockRestore()
    }
  })
})
