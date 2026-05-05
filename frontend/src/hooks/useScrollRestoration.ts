import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

const STORAGE_PREFIX = 'alphaforge.scroll:'

/**
 * ページ単位で window scrollY を sessionStorage に保存・復元する。
 *
 * - ready が true になった最初の 1 回だけ復元する（データロード待ち）
 * - 以降は scroll イベントで常時保存
 * - キーは pathname のみ（URL params 変更時に復元しない）
 */
export function useScrollRestoration(ready: boolean): void {
  const location = useLocation()
  const key = `${STORAGE_PREFIX}${location.pathname}`
  const restoredRef = useRef(false)

  useEffect(() => {
    if (!ready || restoredRef.current) return
    const saved = sessionStorage.getItem(key)
    if (saved !== null) {
      const y = Number.parseInt(saved, 10)
      if (!Number.isNaN(y)) {
        requestAnimationFrame(() => {
          window.scrollTo(0, y)
        })
      }
    }
    restoredRef.current = true
  }, [ready, key])

  useEffect(() => {
    const handleScroll = (): void => {
      sessionStorage.setItem(key, String(window.scrollY))
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [key])
}
