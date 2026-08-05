import type { ReactElement } from 'react'
import { Link } from 'react-router'
import { Button, Chip } from '../../design/primitives'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'

/**
 * 各ステップの完了状態。
 *
 * - `true` / `false`: 実データ（データ件数・戦略件数・run 件数）に基づく判定
 * - `null`: 判定不能（API 失敗など）。完了とは主張しない
 *
 * 最適化・Pine 出力は既存 API に痕跡が残らないため完了判定を持たない
 * （検証できない完了状態を偽装しない）。
 */
export interface GuideSteps {
  dataDone: boolean | null
  strategyDone: boolean | null
  backtestDone: boolean | null
  /** 導線のプリセット先。戦略が 1 件も無ければ null（/browse へフォールバック） */
  firstStrategyId: string | null
}

interface Props {
  lang: Lang
  steps: GuideSteps
  dismissed: boolean
  onDismiss: () => void
  onRestore: () => void
}

interface StepModel {
  key: string
  title: string
  body: string
  to: string
  done: boolean | null
}

const LINK_STYLE: React.CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: 'var(--fs-body)',
  fontWeight: 600,
  color: 'var(--accent)',
}

/**
 * 「はじめての戦略作成」5 ステップガイド（issue #493・Presentational）。
 *
 * セットアップ完了後の最初の成功体験（データ取得 → 戦略作成 → バックテスト
 * 確認 → 最適化 → TradingView へ出力）まで迷わず到達させる。中級者に
 * 押し付けないよう「今後表示しない」を持ち、非表示中も再表示ボタンで戻れる。
 */
export function FirstStrategyGuide({
  lang,
  steps,
  dismissed,
  onDismiss,
  onRestore,
}: Props): ReactElement {
  const L = makeL(lang)

  if (dismissed) {
    return (
      <div style={{ marginTop: 'var(--space-5)' }}>
        <Button variant="ghost" size="sm" onClick={onRestore}>
          {L('はじめての戦略作成ガイドを再表示', 'Show the first-strategy guide again')}
        </Button>
      </div>
    )
  }

  const detailBase = steps.firstStrategyId != null
    ? `/detail/${encodeURIComponent(steps.firstStrategyId)}`
    : null

  const models: StepModel[] = [
    {
      key: 'data',
      title: L('データを取得する', 'Fetch data'),
      body: L(
        'バックテストに使う銘柄のヒストリカルデータを取得します。',
        'Download historical data for the symbols you want to backtest.',
      ),
      to: '/data',
      done: steps.dataDone,
    },
    {
      key: 'strategy',
      title: L('戦略を作る', 'Create a strategy'),
      body: L(
        'AI に目標を伝えて最初の戦略を作ります（既存戦略の複製から始めることもできます）。',
        'Tell the AI your goal and create your first strategy (or start by duplicating an existing one).',
      ),
      to: '/develop',
      done: steps.strategyDone,
    },
    {
      key: 'backtest',
      title: L('バックテスト結果を見る', 'Review backtest results'),
      body: L(
        '損益カーブや Sharpe などの指標で戦略の性質を確認します。',
        'Inspect the equity curve and metrics like Sharpe to understand the strategy.',
      ),
      to: detailBase ?? '/browse',
      done: steps.backtestDone,
    },
    {
      key: 'optimize',
      title: L('最適化する', 'Optimize'),
      body: L(
        '詳細画面の「最適化」タブでパラメータを探索し、成績を改善します。',
        'Explore parameters on the Optimize tab of the detail screen to improve performance.',
      ),
      to: detailBase != null ? `${detailBase}?tab=optimize` : '/browse',
      done: null,
    },
    {
      key: 'pine',
      title: L('Pine で TradingView へ', 'Export Pine to TradingView'),
      body: L(
        '戦略タブの「TradingView へ出力」カードから Pine Script を書き出します。',
        'Export Pine Script from the "Export to TradingView" card on the Strategy tab.',
      ),
      to: detailBase != null ? `${detailBase}?tab=strategy` : '/browse',
      done: null,
    },
  ]

  return (
    <section
      aria-label={L('はじめての戦略作成', 'Your first strategy')}
      style={{ marginTop: 'var(--space-6)', maxWidth: 720 }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2
          style={{
            margin: '0 0 var(--space-2)',
            fontFamily: 'var(--serif)',
            fontSize: 'var(--fs-h2)',
            fontWeight: 700,
            color: 'var(--text)',
          }}
        >
          {L('はじめての戦略作成', 'Your first strategy')}
        </h2>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          {L('今後表示しない', "Don't show again")}
        </Button>
      </div>
      <ol
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}
      >
        {models.map((step, i) => (
          <li
            key={step.key}
            style={{
              display: 'flex',
              gap: 12,
              padding: 'var(--space-4)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface)',
            }}
          >
            <span
              aria-hidden
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-body)',
                fontWeight: 700,
                color: step.done === true ? 'var(--success)' : 'var(--text3)',
                minWidth: 24,
              }}
            >
              {i + 1}.
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Link to={step.to} style={LINK_STYLE}>
                  {step.title} →
                </Link>
                {step.done === true && <Chip tone="positive">{L('完了', 'Done')}</Chip>}
              </span>
              <span
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 'var(--fs-caption)',
                  color: 'var(--text3)',
                }}
              >
                {step.body}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
