import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { BacktestMetrics } from '../../api/types'
import { evaluateGood, type GoodWhen } from './evaluate'

interface MetricCardProps {
  label: string
  value: number | string | null | undefined
  suffix?: string
  goodWhen?: GoodWhen
  big?: boolean
  sub?: string | null
}

function MetricCard({ label, value, suffix = '', goodWhen = null, big = false, sub = null }: MetricCardProps) {
  const num = typeof value === 'number' ? value : null
  const isGood = evaluateGood(num, goodWhen)
  const valColor =
    isGood === true ? 'var(--success)' : isGood === false ? 'var(--danger)' : 'var(--text)'
  const display =
    num === null
      ? String(value ?? '—')
      : Math.abs(num) >= 100
        ? num.toFixed(1)
        : Math.abs(num) >= 10
          ? num.toFixed(2)
          : num.toFixed(3)

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
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-caption)',
          fontWeight: 500,
          color: 'var(--text3)',
          letterSpacing: 'var(--tracking-caption)',
          textTransform: 'uppercase',
        }}
      >
        {label}
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
  const kpis: MetricCardProps[] = [
    { label: L('総リターン', 'Total Return'), value: m.total_return_pct, suffix: '%', goodWhen: 'pos', big: true },
    { label: L('シャープ比', 'Sharpe Ratio'), value: m.sharpe_ratio, goodWhen: 'gte1', big: true },
    { label: L('最大DD', 'Max Drawdown'), value: m.max_drawdown_pct, suffix: '%', goodWhen: 'neg', big: true },
    { label: L('勝率', 'Win Rate'), value: m.win_rate_pct, suffix: '%', goodWhen: 'wr', big: true },
  ]
  const secondary: MetricCardProps[] = [
    { label: 'CAGR', value: m.cagr_pct, suffix: '%', goodWhen: 'pos' },
    { label: L('ソルティノ', 'Sortino'), value: m.sortino_ratio, goodWhen: 'gte1' },
    { label: L('カルマー', 'Calmar'), value: m.calmar_ratio, goodWhen: 'pos' },
    { label: 'Profit Factor', value: m.profit_factor, goodWhen: 'gte15' },
    { label: L('取引数', 'Trades'), value: m.total_trades },
    { label: L('平均保有', 'Avg Hold'), value: m.avg_holding_days, suffix: 'd' },
    { label: L('オメガ比', 'Omega'), value: m.omega_ratio, goodWhen: 'gte1' },
    { label: 'Tail Ratio', value: m.tail_ratio, goodWhen: 'gte1' },
    { label: 'VaR 95%', value: m.var_95_pct, suffix: '%' },
    { label: 'CVaR 95%', value: m.cvar_95_pct, suffix: '%' },
    { label: L('市場露出', 'Exposure'), value: m.exposure_pct, suffix: '%' },
    { label: L('利益月率', '+ Months'), value: m.positive_month_ratio, suffix: '%', goodWhen: 'wr' },
    { label: L('最大連勝', 'Max Cons. W'), value: m.max_consecutive_wins },
    { label: L('最大連敗', 'Max Cons. L'), value: m.max_consecutive_losses },
    { label: L('平均利益%', 'Avg Win%'), value: m.avg_win_pct, suffix: '%', goodWhen: 'pos' },
    { label: L('平均損失%', 'Avg Loss%'), value: m.avg_loss_pct, suffix: '%', goodWhen: 'neg' },
    { label: L('DD期間', 'DD Duration'), value: m.max_drawdown_duration_days, suffix: 'd' },
    {
      label: L('回復日数', 'Recovery'),
      value: m.recovery_days ?? '—',
      suffix: m.recovery_days ? 'd' : '',
    },
  ]
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
          <MetricCard key={i} {...c} />
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
            <MetricCard key={i} {...c} />
          ))}
        </div>
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
            <MetricCard label={L('アルファ α', 'Alpha α')} value={m.benchmark.alpha_pct} suffix="%" goodWhen="pos" />
            <MetricCard label="Beta β" value={m.benchmark.beta} />
            <MetricCard label="Info Ratio" value={m.benchmark.information_ratio} goodWhen="gte1" />
            <MetricCard label={L('相関係数', 'Correlation')} value={m.benchmark.correlation} />
            <MetricCard label="B/M Total Ret" value={m.benchmark.benchmark_total_return_pct} suffix="%" goodWhen="pos" />
            <MetricCard label="B/M CAGR" value={m.benchmark.benchmark_cagr_pct} suffix="%" goodWhen="pos" />
          </div>
        </>
      )}
    </div>
  )
}
