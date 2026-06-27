import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useViewerSettings } from '../hooks/useTheme'
import { makeL } from '../i18n/strings'
import { AppNav } from './AppNav'
import { CommandPalette } from './CommandPalette'

const MAIN_ID = 'main-content'

function isPaletteHotkey(e: KeyboardEvent): boolean {
  if (e.key !== 'k' && e.key !== 'K') return false
  return e.metaKey || e.ctrlKey
}

export function RootLayout(): React.ReactElement {
  const { settings } = useViewerSettings()
  const L = makeL(settings.lang)
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
      <a href={`#${MAIN_ID}`} className="skip-link">
        {L('本文へスキップ', 'Skip to content')}
      </a>
      <AppNav lang={settings.lang} />
      <main id={MAIN_ID} tabIndex={-1}>
        <Outlet />
      </main>
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
