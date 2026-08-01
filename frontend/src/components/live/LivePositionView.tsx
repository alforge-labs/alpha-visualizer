import type { ReactElement } from 'react'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { LivePositionMetrics, LiveSummary } from '../../api/types'
import { SectionLabel } from '../../design/primitives'
import { useChartTheme } from '../../design/useChartTheme'
import { EquityDrawdownPaneTV, type EquityOverlay } from '../../charts/tv/EquityDrawdownPaneTV'
import { toDrawdown } from '../../lib/liveEquity'
import { diffTone } from './format'
import { fmtDiff, fmtNumber } from '../../lib/format'
import { downloadLiveShareCard } from '../../lib/shareCard'
import { buildLiveShareTweetText, openXIntent } from '../../lib/shareTweet'
import { ShareButton, ShareXButton } from '../ShareCardButton'
import { LiveKpiRow } from './LiveKpiRow'
import { LivePositionsTable } from './LivePositionsTable'
import { SummaryCard } from './SummaryCard'

interface Props {
  summary: LiveSummary
  warnings: string[]
  lang: Lang
}

interface MetricDef {
  key: keyof LivePositionMetrics
  jaLabel: string
  enLabel: string
  suffix?: string
  /** true = 値が小さいほど良い（Max DD / Volatility）。diff トーンを反転する */
  invert?: boolean
}

const METRICS: readonly MetricDef[] = [
  { key: 'total_return_pct', jaLabel: 'トータルリターン', enLabel: 'Total Return', suffix: '%' },
  { key: 'cagr_pct', jaLabel: 'CAGR', enLabel: 'CAGR', suffix: '%' },
  { key: 'sharpe_ratio', jaLabel: 'シャープレシオ', enLabel: 'Sharpe' },
  { key: 'max_drawdown_pct', jaLabel: '最大DD', enLabel: 'Max DD', suffix: '%', invert: true },
  { key: 'volatility_pct', jaLabel: 'ボラティリティ', enLabel: 'Volatility', suffix: '%', invert: true },
]

function metricDiff(live: number | null | undefined, bt: number | null | undefined): number | null {
  if (live == null || bt == null) return null
  return live - bt
}

/**
 * `benchmark_equity` / `backtest_equity` の許容判定（Finding 1 対応）。
 *
 * `EquityDrawdownPaneTV` / `useEquityViewport` は overlay の値を equity と
 * **同じインデックス**でスライスする（`sliceByRange` が `values[start + i]` で
 * 参照する）。バックエンドは同一日付インデックスで 3 系列を返す契約だが、
 * それを盲信せず、長さが `equity` と一致しない場合はここで弾く。
 *
 * この判定結果は overlay（チャート）と KPI 行（超過リターン）の**両方**が
 * 共有する唯一の判定にする。チャートには「インデックスがずれた比較線を
 * 黙って描くよりは非表示の方が安全」という理由で弾いておきながら、同じ
 * 系列を KPI 側の数値計算にだけ生で流すと、チャートには出ない指数が
 * 「超過リターン vs 指数」という見出しの実数として画面に表示されてしまう
 * （表示するには信頼できないが見出し数値にするには信頼できる、という
 * 矛盾）。判定を 1 箇所にまとめ、弾かれた系列は KPI にも渡さない。
 *
 * 弾いた場合は `console.warn` で契約違反の痕跡を残す。黙って捨てるだけでは
 * 本番でバックエンドの契約が崩れたときに気付く手段が無くなる。
 */
function admitComparisonSeries(
  label: string,
  series: [string, number][] | undefined,
  equityLength: number,
): [string, number][] | null {
  if (!series || series.length === 0) return null
  if (series.length !== equityLength) {
    console.warn(
      `[LivePositionView] overlay "${label}" の長さが equity と一致しないため非表示にします ` +
        `(equity: ${equityLength} 件, overlay: ${series.length} 件)`,
    )
    return null
  }
  return series
}

/**
 * `ChartTheme.series`（accent / steel / moss / umber / mauve）における mauve の位置。
 *
 * 指数の色をパレット任せにすると、ラベルのソート順で 2 色目の steel が当たる。
 * ライブ equity は success（緑 #4A723A）/ danger（赤）で描かれ、steel(#5B7A8C) は
 * 緑と ΔE 44.6 しか離れていない（他の系列ペアは 67〜75）。明度も L* 49.5 vs 43.9 と
 * 近いため、細い線では主系列と見分けられない。緑からも赤からも離れた mauve
 * （ΔE 67.7）を固定で割り当てる。
 */
const MAUVE_SERIES_INDEX = 4

/** 許容済み系列（`admitComparisonSeries` 通過後）を overlay 形式に変換する。 */
function toOverlay(
  label: string,
  series: [string, number][] | null,
  style?: Pick<EquityOverlay, 'color' | 'dashed'>,
): EquityOverlay | null {
  if (!series) return null
  return { label, values: series.map(([, v]) => v), ...style }
}

/**
 * position ベース combine portfolio のライブ実績表示（#221）。
 *
 * trade 単位の実績を持たない portfolio（``live_position_summaries`` 由来、
 * ``summary.kind === 'position'``）向けに、KPI 行・equity/drawdown チャート
 * （指数・バックテスト比較オーバーレイ付き）・既存の指標カード群・建玉
 * テーブルを組み立てる（Live equity リッチ化 Task 13）。
 *
 * 旧 DB 応答（`benchmark_equity` / `backtest_equity` / `positions` が
 * `undefined`）でもクラッシュせず、KPI 行とチャートのみで描画できることが
 * 最重要要件。存在しない系列を 0 やダッシュで埋めるのではなく、対応する
 * UI ブロックごと省略する。
 */
export function LivePositionView({ summary, warnings, lang }: Props): ReactElement {
  const L = makeL(lang)
  const theme = useChartTheme()
  const metrics = summary.metrics ?? {}
  const bt = summary.backtest_metrics ?? null
  const equity = summary.equity ?? []
  const dates = equity.map(([d]) => d)
  const values = equity.map(([, v]) => v)
  const drawdown = toDrawdown(values)
  const positions = summary.positions ?? []

  const benchmarkLabel = L('指数（Buy & Hold）', 'Index (Buy & Hold)')
  const backtestLabel = L('バックテスト', 'Backtest')
  // チャートと KPI 行、両方の入力をここで一度だけ判定する（Finding 1）。
  const acceptedBenchmark = admitComparisonSeries(benchmarkLabel, summary.benchmark_equity, values.length)
  const acceptedBacktest = admitComparisonSeries(backtestLabel, summary.backtest_equity, values.length)

  const overlays: EquityOverlay[] = [
    // 指数だけは色と線種を明示する（理由は MAUVE_SERIES_INDEX のコメント）。
    // 破線は色以外の手がかりでの区別も兼ねる（バックテスト画面の Buy & Hold と同じ扱い）
    toOverlay(benchmarkLabel, acceptedBenchmark, {
      color: theme.series[MAUVE_SERIES_INDEX],
      dashed: true,
    }),
    // バックテストは既定パレット（accent 橙）のまま。equity の緑・赤とは十分離れている
    toOverlay(backtestLabel, acceptedBacktest),
  ].filter((o): o is EquityOverlay => o != null)

  return (
    // testId は撮影・ビジュアル回帰のクロップ対象（strategy-screen / optimize-screen と同じ役割）。
    <div
      data-testid="live-position-view"
      style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
    >
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <SectionLabel>
            {L('ライブ実績サマリー（ポジションベース）', 'Live Summary (position-based)')}
          </SectionLabel>
          <div style={{ display: 'flex', gap: 6 }}>
            <ShareButton
              lang={lang}
              onClick={() => downloadLiveShareCard(summary, lang, theme)}
            />
            <ShareXButton
              lang={lang}
              onClick={() => {
                downloadLiveShareCard(summary, lang, theme)
                openXIntent(buildLiveShareTweetText(summary, lang))
              }}
            />
          </div>
        </div>
        <MetaLine summary={summary} warnings={warnings} lang={lang} />
      </div>

      <LiveKpiRow
        equity={equity}
        benchmarkEquity={acceptedBenchmark ?? undefined}
        backtestEquity={acceptedBacktest ?? undefined}
        lang={lang}
      />

      {values.length > 0 && (
        <div data-testid="live-position-equity">
          <SectionLabel>{L('ライブ equity', 'Live equity')}</SectionLabel>
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              marginTop: 8,
            }}
          >
            <EquityDrawdownPaneTV
              equity={values}
              dates={dates}
              drawdown={drawdown}
              isCutoffIdx={0}
              overlays={overlays}
              // 既定の 'Strategy' はバックテスト画面向けの名前。ここでの主系列は
              // 実運用の成績なので、比較系列（指数・バックテスト）と取り違えない名前にする
              equityLabel={L('ライブ', 'Live')}
              lang={lang}
            />
          </div>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        {METRICS.map((m) => {
          const live = metrics[m.key]
          const diff = metricDiff(live, bt?.[m.key])
          return (
            <SummaryCard
              key={m.key}
              testId="live-position-card"
              label={L(m.jaLabel, m.enLabel)}
              value={fmtNumber(live ?? null, m.suffix ? { suffix: m.suffix } : undefined)}
              diff={fmtDiff(diff, m.suffix)}
              diffTone={diffTone(m.invert && diff != null ? -diff : diff)}
              backtest={fmtNumber(bt?.[m.key] ?? null, m.suffix ? { suffix: m.suffix } : undefined)}
              lang={lang}
            />
          )
        })}
      </div>

      {positions.length > 0 && (
        <LivePositionsTable
          positions={positions}
          cash={summary.cash ?? 0}
          totalValue={summary.total_value ?? 0}
          lang={lang}
        />
      )}
    </div>
  )
}

interface MetaLineProps {
  summary: LiveSummary
  warnings: string[]
  lang: Lang
}

function MetaLine({ summary, warnings, lang }: MetaLineProps): ReactElement {
  const L = makeL(lang)
  const subs = summary.sub_strategies ?? []
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        marginTop: 4,
        fontFamily: 'var(--mono)',
        fontSize: '0.78rem',
        color: 'var(--text3)',
      }}
    >
      {summary.receipts_count != null && (
        <span>{L('約定記録', 'receipts')}: {summary.receipts_count}</span>
      )}
      {summary.updated_at && (
        <span>
          {L('更新', 'updated')}: {summary.updated_at.slice(0, 19).replace('T', ' ')}
        </span>
      )}
      {subs.length > 0 && (
        <span>
          {L('構成戦略', 'Strategies')}: {subs.join(', ')}
        </span>
      )}
      {warnings.length > 0 && (
        <span style={{ color: 'var(--text2)' }}>⚠ {warnings.join(' / ')}</span>
      )}
    </div>
  )
}
