import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { DeriveEntryCard } from '../DeriveEntryCard'

/** issue #491: Detail から派生開発（/develop?base=<id>）への導線。 */
describe('DeriveEntryCard (issue #491)', () => {
  it('派生開発画面へのプリセット付きリンクを出す', () => {
    render(
      <MemoryRouter>
        <DeriveEntryCard strategyId="cl_hmm_v1" lang="ja" />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('link', { name: /AI で改善する/ }).getAttribute('href'),
    ).toBe('/develop?base=cl_hmm_v1')
    // 元戦略が変更されない安心情報を必ず添える
    expect(screen.getByText(/元の戦略は変更されません/)).toBeInTheDocument()
  })
})
