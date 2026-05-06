import { renderHook, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { useScrollRestoration } from '../useScrollRestoration'

const STORAGE_PREFIX = 'alphaforge.scroll:'
const PATH = '/browse'
const KEY = `${STORAGE_PREFIX}${PATH}`

function makeWrapper() {
  return function Wrapper({ children }: PropsWithChildren) {
    return <MemoryRouter initialEntries={[PATH]}>{children}</MemoryRouter>
  }
}

let scrollToSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  // requestAnimationFrame を即時実行に
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})

describe('useScrollRestoration', () => {
  it('does nothing when ready=false', () => {
    sessionStorage.setItem(KEY, '500')

    renderHook(({ ready }: { ready: boolean }) => useScrollRestoration(ready), {
      wrapper: makeWrapper(),
      initialProps: { ready: false },
    })

    expect(scrollToSpy).not.toHaveBeenCalled()
  })

  it('restores scrollY from sessionStorage when ready=true', () => {
    sessionStorage.setItem(KEY, '500')

    renderHook(({ ready }: { ready: boolean }) => useScrollRestoration(ready), {
      wrapper: makeWrapper(),
      initialProps: { ready: true },
    })

    expect(scrollToSpy).toHaveBeenCalledWith(0, 500)
  })

  it('does not call scrollTo when ready=true but no saved value', () => {
    renderHook(({ ready }: { ready: boolean }) => useScrollRestoration(ready), {
      wrapper: makeWrapper(),
      initialProps: { ready: true },
    })

    expect(scrollToSpy).not.toHaveBeenCalled()
  })

  it('only restores once — re-render with ready=true again does not call scrollTo twice', () => {
    sessionStorage.setItem(KEY, '500')

    const { rerender } = renderHook(
      ({ ready }: { ready: boolean }) => useScrollRestoration(ready),
      {
        wrapper: makeWrapper(),
        initialProps: { ready: true },
      },
    )

    expect(scrollToSpy).toHaveBeenCalledTimes(1)

    rerender({ ready: true })
    expect(scrollToSpy).toHaveBeenCalledTimes(1)
  })

  it('persists window.scrollY to sessionStorage on scroll event', () => {
    renderHook(({ ready }: { ready: boolean }) => useScrollRestoration(ready), {
      wrapper: makeWrapper(),
      initialProps: { ready: false },
    })

    Object.defineProperty(window, 'scrollY', { value: 123, configurable: true })
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })

    expect(sessionStorage.getItem(KEY)).toBe('123')
  })

  it('ignores non-numeric saved values', () => {
    sessionStorage.setItem(KEY, 'not-a-number')

    renderHook(({ ready }: { ready: boolean }) => useScrollRestoration(ready), {
      wrapper: makeWrapper(),
      initialProps: { ready: true },
    })

    expect(scrollToSpy).not.toHaveBeenCalled()
  })
})
