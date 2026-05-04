export type ScreenId = 'backtest' | 'wfo' | 'compare' | 'isoos'

export interface NavItem {
  id: ScreenId
  iconPath: string
  jaLabel: string
  enLabel: string
}

export const NAV: readonly NavItem[] = [
  {
    id: 'backtest',
    iconPath: 'M3 13l4-5 3 4 3-5 5 4',
    jaLabel: 'バックテスト',
    enLabel: 'Backtest',
  },
  {
    id: 'wfo',
    iconPath: 'M2 10 a8 8 0 0 1 16 0 M6 10 a4 4 0 0 1 8 0 M10 2v2 M10 16v2 M18 10h-2 M4 10H2',
    jaLabel: 'ウォークフォーワード',
    enLabel: 'Walk-Forward',
  },
  { id: 'compare', iconPath: 'M4 6h16M4 12h10M4 18h14', jaLabel: '戦略比較', enLabel: 'Compare' },
  { id: 'isoos', iconPath: 'M12 2v20M2 12h20', jaLabel: 'IS / OOS', enLabel: 'IS / OOS' },
]
