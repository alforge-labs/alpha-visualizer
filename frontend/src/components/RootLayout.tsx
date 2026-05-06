import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useViewerSettings } from '../hooks/useTheme'
import { CommandPalette } from './CommandPalette'

function isPaletteHotkey(e: KeyboardEvent): boolean {
  if (e.key !== 'k' && e.key !== 'K') return false
  return e.metaKey || e.ctrlKey
}

export function RootLayout(): React.ReactElement {
  const { settings } = useViewerSettings()
  const [paletteOpen, setPaletteOpen] = useState<boolean>(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isPaletteHotkey(e)) {
        e.preventDefault()
        setPaletteOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <Outlet />
      {paletteOpen && (
        <CommandPalette
          open
          onClose={() => setPaletteOpen(false)}
          lang={settings.lang}
        />
      )}
    </>
  )
}
