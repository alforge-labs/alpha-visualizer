import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useDocumentTitle } from '../useDocumentTitle'

/** issue #263: document.title が固定で、現在の戦略/画面を反映しない。 */
function Harness({ title }: { title?: string }) {
  useDocumentTitle(title)
  return null
}

describe('useDocumentTitle (issue #263)', () => {
  it('sets the document title with the app suffix', () => {
    render(<Harness title="戦略ブラウザ" />)
    expect(document.title).toBe('戦略ブラウザ — AlphaForge Viewer')
  })

  it('falls back to the suffix only when no title is given', () => {
    render(<Harness />)
    expect(document.title).toBe('AlphaForge Viewer')
  })
})
