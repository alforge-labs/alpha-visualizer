export interface MetricDef {
  label: string
  labelEn: string
  description: string
  descriptionEn: string
  formula?: string
}

// 指標説明の SSoT（issue #360）。
// 目安値は UI の色分けしきい値（evaluate.ts / MetricsSummaryBarV2 の tone）と
// 同じ数値を書くこと。しきい値を変えるときはここも更新する
// （metricDefinitions.test.ts が drift を検出する）。
export const METRIC_DEFINITIONS: Record<string, MetricDef> = {
  // ---- KPI ----------------------------------------------------------------
  total_return_pct: {
    label: '総リターン',
    labelEn: 'Total Return',
    description:
      '期間全体の損益率（初期資金比）。プラスが最低条件だが、期間の長さ・最大DDとあわせて評価する。',
    descriptionEn:
      'Total profit/loss over the whole period relative to initial capital. Positive is the bare minimum; judge together with period length and Max DD.',
  },
  sharpe_ratio: {
    label: 'Sharpe Ratio',
    labelEn: 'Sharpe Ratio',
    description:
      'リスク調整後リターン。超過リターンをリターンの標準偏差で割った値。一般に 1.0 以上で良好、0.5 未満は要注意。',
    descriptionEn:
      'Risk-adjusted return: excess return divided by return std dev. Generally 1.0+ is good; below 0.5 needs caution.',
    formula: '(Rp − Rf) / σp × √252',
  },
  cagr_pct: {
    label: 'CAGR',
    labelEn: 'CAGR',
    description:
      '年率換算リターン（複利）。期間の異なる戦略を比較する共通尺度。プラスであることが前提。',
    descriptionEn:
      'Compound Annual Growth Rate. A common yardstick to compare strategies with different period lengths.',
    formula: '(最終値 / 初期値)^(1/年数) − 1',
  },
  max_drawdown_pct: {
    label: 'Max DD',
    labelEn: 'Max DD',
    description:
      '最大ドローダウン。資産曲線のピークからの最大下落率。一般に 15% 以下なら穏やか、30% 超は要注意（本アプリの色分けも同じ閾値）。',
    descriptionEn:
      'Maximum peak-to-trough decline of the equity curve. Generally ≤15% is mild and >30% needs caution (the color coding uses the same thresholds).',
  },
  win_rate_pct: {
    label: 'Win%',
    labelEn: 'Win%',
    description:
      '勝率。プラスで終了したトレードの割合。55% 以上なら良好、45% 未満は要注意。ただし損益レシオ次第で低勝率でも収益は成立する。',
    descriptionEn:
      'Percentage of profitable trades. 55%+ is good, below 45% needs caution — though a high payoff ratio can make low win rates profitable.',
  },
  profit_factor: {
    label: 'PF',
    labelEn: 'PF',
    description:
      'プロフィットファクター。総利益 ÷ 総損失。1.0 超が損益分岐、1.5 以上で良好。',
    descriptionEn:
      'Gross profit / gross loss. Above 1.0 is break-even territory; 1.5+ is good.',
  },
  total_trades: {
    label: 'Trades',
    labelEn: 'Trades',
    description:
      '総トレード数。目安 30 件未満だと統計的な信頼性が低く、他の指標が偶然良く見えることがある。',
    descriptionEn:
      'Total number of trades. Below ~30 the statistics are unreliable and other metrics can look good by chance.',
  },
  // ---- 詳細カード ----------------------------------------------------------
  sortino_ratio: {
    label: 'ソルティノ',
    labelEn: 'Sortino',
    description:
      'ソルティノ・レシオ。下落方向の変動のみをリスクとみなす Sharpe の変種。上振れの大きい戦略を過小評価しない。1.0 以上が目安。',
    descriptionEn:
      'Sortino ratio: a Sharpe variant that counts only downside volatility as risk. 1.0+ is a common benchmark.',
  },
  calmar_ratio: {
    label: 'カルマー',
    labelEn: 'Calmar',
    description:
      'カルマー・レシオ。CAGR ÷ 最大DD。ドローダウンに対するリターン効率。プラスが最低条件、1.0 以上なら良好。',
    descriptionEn:
      'Calmar ratio: CAGR / Max DD — return efficiency per unit of drawdown. Positive at minimum; 1.0+ is good.',
    formula: 'CAGR / |Max DD|',
  },
  avg_holding_days: {
    label: '平均保有',
    labelEn: 'Avg Hold',
    description: '1 トレードあたりの平均保有日数。戦略の時間軸（短期/スイング/長期）を示す。',
    descriptionEn: 'Average holding period per trade, indicating the strategy timeframe.',
  },
  omega_ratio: {
    label: 'オメガ比',
    labelEn: 'Omega',
    description:
      'オメガ比。しきい値（通常 0）を上回ったリターン総量と下回った総量の比。1.0 超ならプラス側が優勢。',
    descriptionEn:
      'Omega ratio: total gains above a threshold (usually 0) divided by total losses below it. Above 1.0 means gains dominate.',
  },
  tail_ratio: {
    label: 'Tail Ratio',
    labelEn: 'Tail Ratio',
    description:
      'テイルレシオ。リターン分布の右テール（大勝ち）と左テール（大負け）の比。1.0 超なら大勝ち側が優勢。',
    descriptionEn:
      'Ratio of the right tail (big wins) to the left tail (big losses) of the return distribution. Above 1.0 means big wins dominate.',
  },
  var_95_pct: {
    label: 'VaR 95%',
    labelEn: 'VaR 95%',
    description:
      'バリュー・アット・リスク。95% の確率でこれより悪化しない 1 日損失率の推計。残り 5% の日はこれ以上の損失が起こり得る。',
    descriptionEn:
      'Value at Risk: the estimated daily loss that will not be exceeded with 95% confidence. Worse losses can occur on the remaining 5% of days.',
  },
  cvar_95_pct: {
    label: 'CVaR 95%',
    labelEn: 'CVaR 95%',
    description:
      '条件付き VaR（期待ショートフォール）。VaR 95% を超えて損失が出た日の平均損失。テールリスクの深刻度を示す。',
    descriptionEn:
      'Conditional VaR (expected shortfall): the average loss on days worse than VaR 95%. Measures tail-risk severity.',
  },
  exposure_pct: {
    label: '市場露出',
    labelEn: 'Exposure',
    description:
      'ポジションを保有していた期間の割合。100% に近いほど常時ポジションを持つ戦略で、市場急変の影響を受けやすい。',
    descriptionEn:
      'Share of time with an open position. Near 100% means always-in-market and more exposed to sudden market shocks.',
  },
  positive_month_ratio: {
    label: '利益月率',
    labelEn: '+ Months',
    description: '月次リターンがプラスだった月の割合。55% 以上なら安定して積み上がっている目安。',
    descriptionEn: 'Share of months with positive returns. 55%+ suggests steady compounding.',
  },
  max_consecutive_wins: {
    label: '最大連勝',
    labelEn: 'Max Cons. W',
    description: '最大連勝数。連勝中の増し玉などサイズ調整の設計に使える。',
    descriptionEn: 'Longest winning streak. Useful for sizing rules such as pyramiding.',
  },
  max_consecutive_losses: {
    label: '最大連敗',
    labelEn: 'Max Cons. L',
    description:
      '最大連敗数。この連敗に耐えられるポジションサイズか、資金管理の設計に直結する。',
    descriptionEn:
      'Longest losing streak. Directly informs whether your position size survives such a streak.',
  },
  avg_win_pct: {
    label: '平均利益%',
    labelEn: 'Avg Win%',
    description: '勝ちトレード 1 件あたりの平均リターン。平均損失%との比が損益レシオ（Payoff）。',
    descriptionEn:
      'Average return per winning trade. Divided by Avg Loss% it gives the payoff ratio.',
  },
  avg_loss_pct: {
    label: '平均損失%',
    labelEn: 'Avg Loss%',
    description: '負けトレード 1 件あたりの平均損失。小さいほど損切りが機能している。',
    descriptionEn: 'Average loss per losing trade. Smaller means stop-losses are working.',
  },
  max_drawdown_duration_days: {
    label: 'DD期間',
    labelEn: 'DD Duration',
    description:
      'ドローダウン期間。ピークを割ってから回復するまでの最長日数。長いほど心理的・資金的に耐えにくい。',
    descriptionEn:
      'Longest stretch (days) from an equity peak until recovery. Longer is harder to endure.',
  },
  recovery_days: {
    label: '回復日数',
    labelEn: 'Recovery',
    description: '最大DDの谷からピークを回復するまでに要した日数。未回復の場合は表示されない。',
    descriptionEn:
      'Days taken to recover from the Max DD trough back to the peak. Hidden if not yet recovered.',
  },
  // ---- ベンチマーク ---------------------------------------------------------
  alpha_pct: {
    label: 'アルファ α',
    labelEn: 'Alpha α',
    description:
      'ベンチマークの動きでは説明できない超過リターン（年率）。プラスなら市場平均に勝つ付加価値がある。',
    descriptionEn:
      'Annualized excess return not explained by benchmark moves. Positive means value added over the market.',
  },
  beta: {
    label: 'Beta β',
    labelEn: 'Beta β',
    description:
      'ベンチマークに対する感応度。1 で市場並みの値動き、0 に近いほど市場と独立。',
    descriptionEn:
      'Sensitivity to the benchmark. 1 moves like the market; near 0 is market-independent.',
  },
  information_ratio: {
    label: 'Info Ratio',
    labelEn: 'Info Ratio',
    description:
      '情報比。ベンチマーク超過リターン ÷ トラッキングエラー。超過収益の安定度で、1.0 以上なら優秀。',
    descriptionEn:
      'Excess return over the benchmark divided by tracking error — consistency of outperformance. 1.0+ is excellent.',
  },
  correlation: {
    label: '相関係数',
    labelEn: 'Correlation',
    description:
      'ベンチマークとの相関（−1〜+1）。低いほど市場と異なる値動きで、分散効果が期待できる。',
    descriptionEn:
      'Correlation with the benchmark (−1 to +1). Lower means more diversification benefit.',
  },
  benchmark_total_return_pct: {
    label: 'B/M Total Ret',
    labelEn: 'B/M Total Ret',
    description: '同期間のベンチマーク（Buy & Hold）の総リターン。戦略の付加価値の比較対象。',
    descriptionEn:
      'Benchmark (buy & hold) total return over the same period — the baseline to beat.',
  },
  benchmark_cagr_pct: {
    label: 'B/M CAGR',
    labelEn: 'B/M CAGR',
    description: '同期間のベンチマークの年率換算リターン。',
    descriptionEn: 'Benchmark CAGR over the same period.',
  },
  // ---- シグナル品質（SignalQualityBadge） -----------------------------------
  signal_quality_score: {
    label: '品質スコア',
    labelEn: 'Quality Score',
    description:
      'PSR・DSR 等を合成した 0〜1 のシグナル品質スコア。0.7 以上で良好、0.4 未満は過剰適合の疑いあり。',
    descriptionEn:
      'Composite 0–1 signal quality score from PSR/DSR etc. 0.7+ is good; below 0.4 suggests overfitting.',
  },
  probabilistic_sr: {
    label: 'PSR',
    labelEn: 'PSR',
    description:
      '確率的シャープレシオ。真の Sharpe が 0 を上回っている確率。90% 以上が目安。',
    descriptionEn:
      'Probabilistic Sharpe Ratio: the probability that the true Sharpe exceeds 0. 90%+ is the usual bar.',
  },
  deflated_sr: {
    label: 'DSR（補正済）',
    labelEn: 'DSR (deflated)',
    description:
      'デフレート済みシャープレシオ。パラメータ探索の試行数による「偶然の好成績」を補正した PSR。多数の試行から選んだ戦略ほど下がる。90% 以上が目安。',
    descriptionEn:
      'Deflated Sharpe Ratio: PSR corrected for the number of optimization trials, penalizing lucky picks from many attempts. 90%+ is the usual bar.',
  },
  n_trials: {
    label: '試行数',
    labelEn: 'N trials',
    description:
      'この戦略に対して行われた最適化トライアルの数。多いほど偶然良い結果を引く機会が増えるため、DSR の補正が強くなる。',
    descriptionEn:
      'Number of optimization trials behind this strategy. More trials mean more chances of lucky results, so the DSR correction gets stronger.',
  },
}
