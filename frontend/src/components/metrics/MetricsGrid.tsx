import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { BacktestMetrics } from '../../api/types'
import { evaluateGood, type GoodWhen } from './evaluate'
import { MetricInfoTip } from './MetricInfoTip'
import { fmtNumber } from '../../lib/format'
import { isNoTradeSentinel } from '../../lib/sentinel'

interface MetricCardProps {
  label: string
  value: number | string | null | undefined
  suffix?: string
  goodWhen?: GoodWhen
  big?: boolean
  sub?: string | null
  /** METRIC_DEFINITIONS のキー。指定すると説明ツールチップを表示 (issue #360) */
  defKey?: string
  lang?: Lang
}

function MetricCard({
  label,
  value,
  suffix = '',
  goodWhen = null,
  big = false,
  sub = null,
  defKey,
  lang = 'ja',
}: MetricCardProps) {
  const num = typeof value === 'number' ? value : null
  const isGood = evaluateGood(num, goodWhen)
  const valColor =
    isGood === true ? 'var(--success)' : isGood === false ? 'var(--danger)' : 'var(--text)'
  // issue #359: format.ts の SSoT 規約に従い toFixed 直書きをやめる。
  // 整数（取引数・連勝数・DD 期間日数等）は小数なし + 桁区切りになる。
  const display = num === null ? String(value ?? '—') : fmtNumber(num)

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '14px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: big ? 6 : 3,
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-caption)',
          fontWeight: 500,
          color: 'var(--text3)',
          letterSpacing: 'var(--tracking-caption)',
          textTransform: 'uppercase',
        }}
      >
        {label}
        {defKey && <MetricInfoTip defKey={defKey} lang={lang} />}
      </span>
      <span
        style={{
          fontFamily: big ? 'var(--serif)' : 'var(--mono)',
          fontSize: big ? '1.75rem' : '1rem',
          fontWeight: big ? 600 : 500,
          color: valColor,
          letterSpacing: big ? 'var(--tracking-display)' : 0,
          lineHeight: 1.05,
        }}
      >
        {display}
        {suffix}
      </span>
      {sub && (
        <span style={{ fontFamily: 'var(--mono)', fontSize: 'var(--fs-mono-sm)', color: 'var(--text3)' }}>
          {sub}
        </span>
      )}
    </div>
  )
}

interface MetricsGridProps {
  metrics: BacktestMetrics
  compact: boolean
  lang: Lang
}

export function MetricsGrid({ metrics: m, compact, lang }: MetricsGridProps) {
  const L = makeL(lang)
  // issue #351: 取引 0 件の run では forge が Sharpe / Sortino にセンチネル値
  // -100 を書き込む。実測値として表示せず「—」+ 注釈へ置き換える。
  const sentinelNote = L('取引なしのため算出不可', 'N/A — no trades')
  const sharpeSentinel = isNoTradeSentinel(m.sharpe_ratio)
  const sortinoSentinel = isNoTradeSentinel(m.sortino_ratio)
  const kpis: MetricCardProps[] = [
    { label: L('総リターン', 'Total Return'), value: m.total_return_pct, suffix: '%', goodWhen: 'pos', big: true, defKey: 'total_return_pct' },
    {
      label: L('シャープ比', 'Sharpe Ratio'),
      value: sharpeSentinel ? '—' : m.sharpe_ratio,
      goodWhen: sharpeSentinel ? null : 'gte1',
      sub: sharpeSentinel ? sentinelNote : null,
      big: true,
      defKey: 'sharpe_ratio',
    },
    { label: L('最大DD', 'Max Drawdown'), value: m.max_drawdown_pct, suffix: '%', goodWhen: 'dd', big: true, defKey: 'max_drawdown_pct' },
    { label: L('勝率', 'Win Rate'), value: m.win_rate_pct, suffix: '%', goodWhen: 'wr', big: true, defKey: 'win_rate_pct' },
  ]
  const secondary: MetricCardProps[] = [
    { label: 'CAGR', value: m.cagr_pct, suffix: '%', goodWhen: 'pos', defKey: 'cagr_pct' },
    {
      label: L('ソルティノ', 'Sortino'),
      value: sortinoSentinel ? '—' : m.sortino_ratio,
      goodWhen: sortinoSentinel ? null : 'gte1',
      sub: sortinoSentinel ? sentinelNote : null,
      defKey: 'sortino_ratio',
    },
    { label: L('カルマー', 'Calmar'), value: m.calmar_ratio, goodWhen: 'pos', defKey: 'calmar_ratio' },
    { label: 'Profit Factor', value: m.profit_factor, goodWhen: 'gte15', defKey: 'profit_factor' },
    { label: L('取引数', 'Trades'), value: m.total_trades, defKey: 'total_trades' },
    { label: L('平均保有', 'Avg Hold'), value: m.avg_holding_days, suffix: 'd', defKey: 'avg_holding_days' },
    { label: L('オメガ比', 'Omega'), value: m.omega_ratio, goodWhen: 'gte1', defKey: 'omega_ratio' },
    { label: 'Tail Ratio', value: m.tail_ratio, goodWhen: 'gte1', defKey: 'tail_ratio' },
    { label: 'VaR 95%', value: m.var_95_pct, suffix: '%', defKey: 'var_95_pct' },
    { label: 'CVaR 95%', value: m.cvar_95_pct, suffix: '%', defKey: 'cvar_95_pct' },
    { label: L('市場露出', 'Exposure'), value: m.exposure_pct, suffix: '%', defKey: 'exposure_pct' },
    { label: L('利益月率', '+ Months'), value: m.positive_month_ratio, suffix: '%', goodWhen: 'wr', defKey: 'positive_month_ratio' },
    { label: L('最大連勝', 'Max Cons. W'), value: m.max_consecutive_wins, defKey: 'max_consecutive_wins' },
    { label: L('最大連敗', 'Max Cons. L'), value: m.max_consecutive_losses, defKey: 'max_consecutive_losses' },
    { label: L('平均利益%', 'Avg Win%'), value: m.avg_win_pct, suffix: '%', goodWhen: 'pos', defKey: 'avg_win_pct' },
    { label: L('平均損失%', 'Avg Loss%'), value: m.avg_loss_pct, suffix: '%', defKey: 'avg_loss_pct' },
    { label: L('DD期間', 'DD Duration'), value: m.max_drawdown_duration_days, suffix: 'd', defKey: 'max_drawdown_duration_days' },
    {
      label: L('回復日数', 'Recovery'),
      value: m.recovery_days ?? '—',
      suffix: m.recovery_days ? 'd' : '',
      defKey: 'recovery_days',
    },
  ]
  // コスト・上級指標は旧 run の metrics_json に存在しないためフィールド有無で出し分ける (issue #368)
  const hasCosts = m.gross_return_pct != null && m.net_return_pct != null
  const costDrag =
    hasCosts && m.gross_return_pct != null && m.net_return_pct != null
      ? m.gross_return_pct - m.net_return_pct
      : null
  const hasAdvanced =
    m.kelly_criterion != null ||
    m.expectancy_pct != null ||
    m.payoff_ratio != null ||
    m.gain_to_pain_ratio != null ||
    m.ulcer_index != null ||
    m.serenity_index != null ||
    m.recovery_factor != null ||
    m.win_rate_ci != null
  const sectionHeadingStyle = {
    fontFamily: 'var(--sans)',
    fontSize: 'var(--fs-caption)',
    fontWeight: 600,
    color: 'var(--text3)',
    letterSpacing: 'var(--tracking-caption)',
    textTransform: 'uppercase',
    paddingTop: 4,
  } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        data-testid="kpi-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(var(--cols-kpi), minmax(0,1fr))',
          gap: 10,
        }}
      >
        {kpis.map((c, i) => (
          <MetricCard key={i} {...c} lang={lang} />
        ))}
      </div>
      {!compact && (
        <div
          data-testid="secondary-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(var(--cols-kpi-secondary), minmax(0,1fr))',
            gap: 8,
          }}
        >
          {secondary.map((c, i) => (
            <MetricCard key={i} {...c} lang={lang} />
          ))}
        </div>
      )}
      {!compact && hasCosts && (
        <>
          <div style={sectionHeadingStyle}>{L('コスト', 'Costs')}</div>
          <div
            data-testid="cost-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(var(--cols-kpi-secondary), minmax(0,1fr))',
              gap: 8,
            }}
          >
            <MetricCard label={L('グロスリターン', 'Gross Return')} value={m.gross_return_pct} suffix="%" goodWhen="pos" defKey="gross_return_pct" lang={lang} />
            <MetricCard label={L('ネットリターン', 'Net Return')} value={m.net_return_pct} suffix="%" goodWhen="pos" defKey="net_return_pct" lang={lang} />
            <MetricCard label={L('コスト負担', 'Cost Drag')} value={costDrag} suffix="%" defKey="cost_drag_pct" lang={lang} />
            <MetricCard label={L('手数料合計', 'Commission')} value={m.total_commission_paid} defKey="total_commission_paid" lang={lang} />
            <MetricCard label={L('スリッページ合計', 'Slippage')} value={m.total_slippage_cost} defKey="total_slippage_cost" lang={lang} />
          </div>
        </>
      )}
      {!compact && hasAdvanced && (
        <details data-testid="advanced-metrics">
          <summary
            style={{
              cursor: 'pointer',
              fontFamily: 'var(--sans)',
              fontSize: 'var(--fs-caption)',
              fontWeight: 600,
              color: 'var(--text3)',
              letterSpacing: 'var(--tracking-caption)',
              textTransform: 'uppercase',
              padding: '4px 0',
            }}
          >
            {L('上級指標（資金管理・統計）', 'Advanced (sizing & statistics)')}
          </summary>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(var(--cols-kpi-secondary), minmax(0,1fr))',
              gap: 8,
              paddingTop: 8,
            }}
          >
            {/* Kelly は資金比率（0.18 = 18%）で保存されるため % 表示に換算する */}
            <MetricCard label={L('Kelly 基準', 'Kelly')} value={m.kelly_criterion != null ? m.kelly_criterion * 100 : null} suffix="%" defKey="kelly_criterion" lang={lang} />
            <MetricCard label={L('期待値/トレード', 'Expectancy')} value={m.expectancy_pct} suffix="%" goodWhen="pos" defKey="expectancy_pct" lang={lang} />
            <MetricCard label={L('Payoff レシオ', 'Payoff Ratio')} value={m.payoff_ratio} goodWhen="gte1" defKey="payoff_ratio" lang={lang} />
            <MetricCard label="Gain/Pain" value={m.gain_to_pain_ratio} goodWhen="gte1" defKey="gain_to_pain_ratio" lang={lang} />
            <MetricCard label="Ulcer Index" value={m.ulcer_index} defKey="ulcer_index" lang={lang} />
            <MetricCard label="Serenity Index" value={m.serenity_index} defKey="serenity_index" lang={lang} />
            <MetricCard label={L('リカバリーファクター', 'Recovery Factor')} value={m.recovery_factor} goodWhen="gte1" defKey="recovery_factor" lang={lang} />
            <MetricCard
              label={L('勝率 90% CI', 'Win% 90% CI')}
              value={
                m.win_rate_ci
                  ? `${m.win_rate_ci.lower_pct}–${m.win_rate_ci.upper_pct}%`
                  : null
              }
              defKey="win_rate_ci"
              lang={lang}
            />
          </div>
        </details>
      )}
      {!compact && m.benchmark && (
        <>
          <div
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 'var(--fs-caption)',
              fontWeight: 600,
              color: 'var(--text3)',
              letterSpacing: 'var(--tracking-caption)',
              textTransform: 'uppercase',
              paddingTop: 4,
            }}
          >
            {L('ベンチマーク', 'Benchmark')}
          </div>
          <div
            data-testid="benchmark-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(var(--cols-kpi-secondary), minmax(0,1fr))',
              gap: 8,
            }}
          >
            <MetricCard label={L('アルファ α', 'Alpha α')} value={m.benchmark.alpha_pct} suffix="%" goodWhen="pos" defKey="alpha_pct" lang={lang} />
            <MetricCard label="Beta β" value={m.benchmark.beta} defKey="beta" lang={lang} />
            <MetricCard label="Info Ratio" value={m.benchmark.information_ratio} goodWhen="gte1" defKey="information_ratio" lang={lang} />
            <MetricCard label={L('相関係数', 'Correlation')} value={m.benchmark.correlation} defKey="correlation" lang={lang} />
            <MetricCard label="B/M Total Ret" value={m.benchmark.benchmark_total_return_pct} suffix="%" goodWhen="pos" defKey="benchmark_total_return_pct" lang={lang} />
            <MetricCard label="B/M CAGR" value={m.benchmark.benchmark_cagr_pct} suffix="%" goodWhen="pos" defKey="benchmark_cagr_pct" lang={lang} />
          </div>
        </>
      )}
    </div>
  )
}
