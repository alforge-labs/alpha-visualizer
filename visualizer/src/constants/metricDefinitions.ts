export interface MetricDef {
  label: string
  labelEn: string
  description: string
  descriptionEn: string
  formula?: string
}

export const METRIC_DEFINITIONS: Record<string, MetricDef> = {
  sharpe_ratio: {
    label: 'Sharpe Ratio',
    labelEn: 'Sharpe Ratio',
    description: 'リスク調整後リターン。超過リターンをリターンの標準偏差で割った値。1.0以上が目安。',
    descriptionEn: 'Risk-adjusted return. Excess return divided by return std dev. Above 1.0 is good.',
    formula: '(Rp − Rf) / σp × √252',
  },
  cagr_pct: {
    label: 'CAGR',
    labelEn: 'CAGR',
    description: '年率換算リターン（複利）。',
    descriptionEn: 'Compound Annual Growth Rate.',
    formula: '(最終値 / 初期値)^(1/年数) − 1',
  },
  max_drawdown_pct: {
    label: 'Max DD',
    labelEn: 'Max DD',
    description: '最大ドローダウン。ピークからの最大下落率。',
    descriptionEn: 'Maximum peak-to-trough decline.',
  },
  win_rate_pct: {
    label: 'Win%',
    labelEn: 'Win%',
    description: '勝率。プラスで終了したトレードの割合。',
    descriptionEn: 'Percentage of profitable trades.',
  },
  profit_factor: {
    label: 'PF',
    labelEn: 'PF',
    description: 'プロフィットファクター。総利益 / 総損失。1.0超が必要条件。',
    descriptionEn: 'Gross profit / gross loss. Must be above 1.0.',
  },
  total_trades: {
    label: 'Trades',
    labelEn: 'Trades',
    description: '総トレード数。',
    descriptionEn: 'Total number of trades.',
  },
}
