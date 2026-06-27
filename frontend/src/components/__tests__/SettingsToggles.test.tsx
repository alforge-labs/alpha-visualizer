import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LangToggle } from '../SettingsToggles'

/**
 * issue #260 / WCAG 2.5.3 (Label in Name): 言語トグルは可視テキスト "JA"/"EN" だが
 * アクセシブル名が "日本語"/"English" で可視テキストを含まず不一致だった。
 */
describe('LangToggle (issue #260)', () => {
  it('keeps the visible label token inside the accessible name (ja)', () => {
    render(<LangToggle lang="ja" onChange={() => {}} />)
    const ja = screen.getByRole('radio', { name: /日本語/ })
    expect(ja).toHaveTextContent('ja')
    expect(ja).toHaveAccessibleName(/JA/i)
  })

  it('keeps the visible label token inside the accessible name (en)', () => {
    render(<LangToggle lang="ja" onChange={() => {}} />)
    const en = screen.getByRole('radio', { name: /English/ })
    expect(en).toHaveTextContent('en')
    expect(en).toHaveAccessibleName(/EN/i)
  })
})
