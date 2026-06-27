import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useViewerSettings } from '../useTheme'

/**
 * issue #261: 言語を切り替えても <html lang> が "ja" 固定で、SR が英語テキストを
 * 日本語音声で読み上げてしまう。settings.lang を document.documentElement.lang に同期する。
 */
function Harness() {
  const { settings, update } = useViewerSettings()
  return (
    <div>
      <span data-testid="lang">{settings.lang}</span>
      <button onClick={() => update('lang', 'en')}>set-en</button>
      <button onClick={() => update('lang', 'ja')}>set-ja</button>
    </div>
  )
}

describe('useViewerSettings <html lang> sync (issue #261)', () => {
  it('syncs document.documentElement.lang to the selected language', () => {
    render(<Harness />)

    fireEvent.click(screen.getByText('set-en'))
    expect(document.documentElement.lang).toBe('en')

    fireEvent.click(screen.getByText('set-ja'))
    expect(document.documentElement.lang).toBe('ja')
  })
})
