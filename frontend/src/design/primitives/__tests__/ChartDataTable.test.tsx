import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ChartDataTable } from '../ChartDataTable'

/**
 * issue #262: チャートが視覚＋マウスホバー専用で、キーボード/SR 利用者にデータが届かない。
 * 折りたたみ可能なデータテーブル代替を提供し、数値を AT から逆引きできるようにする。
 */
describe('ChartDataTable (issue #262)', () => {
  const columns = ['日付', 'エクイティ']
  const rows = [
    ['2025-01-01', '100,000'],
    ['2025-01-02', '101,200'],
    ['2025-01-03', '99,800'],
  ]

  it('renders a collapsible table with column headers and rows', () => {
    render(<ChartDataTable label="データ表" caption="エクイティ推移" columns={columns} rows={rows} />)
    // <summary> でトグル可能
    expect(screen.getByText('データ表')).toBeInTheDocument()
    // 列ヘッダは scope=col の columnheader
    const headers = screen.getAllByRole('columnheader')
    expect(headers).toHaveLength(2)
    expect(headers[0]).toHaveAttribute('scope', 'col')
    // データ行
    expect(screen.getByText('101,200')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(rows.length + 1) // +header row
  })

  it('caps rows with maxRows and notes the truncation', () => {
    render(
      <ChartDataTable label="データ表" caption="cap" columns={columns} rows={rows} maxRows={2} />,
    )
    // 2 行 + ヘッダ + 省略注記行
    const bodyRows = screen.getAllByRole('row').length
    expect(bodyRows).toBeLessThanOrEqual(2 + 1 + 1)
    expect(screen.queryByText('99,800')).toBeNull()
  })
})
