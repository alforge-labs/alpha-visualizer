import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import type { OptimizeResult, OptimizeTrial } from '../../api/types'
import { OptimizeScreen } from '../OptimizeScreen'

function makeTrial(
  params: Record<string, number>,
  metric: number,
  metrics: Record<string, number> = {},
): OptimizeTrial {
  return { params, metric, pass: metric > 0, metrics: { sharpe_ratio: metric, ...metrics } }
}

function makeData(trials: OptimizeTrial[], extra: Partial<OptimizeResult> = {}): OptimizeResult {
  return {
    strategy_id: 'strat_a',
    run_id: 'opt_run_a',
    run_at: '2024-09-30T00:00:00Z',
    metric_name: 'sharpe_ratio',
    best_metric: trials.length > 0 ? Math.max(...trials.map((t) => t.metric)) : null,
    n_trials: trials.length,
    trials,
    runs: [],
    ...extra,
  }
}

const TWO_PARAM_TRIALS = [
  makeTrial({ sma_fast: 5, sma_slow: 20 }, 1.2, { total_return_pct: 30 }),
  makeTrial({ sma_fast: 10, sma_slow: 20 }, 0.8, { total_return_pct: 15 }),
  makeTrial({ sma_fast: 5, sma_slow: 40 }, -0.3, { total_return_pct: -5 }),
]

function renderScreen(data: OptimizeResult) {
  return render(<OptimizeScreen data={data} compact={false} lang="ja" />)
}

describe('<OptimizeScreen /> ビュー切替', () => {
  it('散布図とヒートマップのタブを表示する', () => {
    renderScreen(makeData(TWO_PARAM_TRIALS))
    expect(screen.getByRole('tab', { name: '散布図' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'ヒートマップ' })).toBeInTheDocument()
  })

  it('デフォルトでは散布図ビューを表示する', () => {
    renderScreen(makeData(TWO_PARAM_TRIALS))
    expect(screen.getByText('パラメータ感度散布図')).toBeInTheDocument()
    expect(screen.queryByTestId('optimize-heatmap')).toBeNull()
  })

  it('ヒートマップタブで X/Y/メトリクスのセレクタとヒートマップを表示する', async () => {
    const user = userEvent.setup()
    renderScreen(makeData(TWO_PARAM_TRIALS))
    await user.click(screen.getByRole('tab', { name: 'ヒートマップ' }))
    expect(screen.getByRole('combobox', { name: 'X軸パラメータ' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Y軸パラメータ' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'メトリクス' })).toBeInTheDocument()
    expect(screen.getByTestId('optimize-heatmap')).toBeInTheDocument()
    expect(screen.queryByText('パラメータ感度散布図')).toBeNull()
  })

  it('Y軸の選択肢には X軸で選択中のパラメータを含めない', async () => {
    const user = userEvent.setup()
    renderScreen(makeData(TWO_PARAM_TRIALS))
    await user.click(screen.getByRole('tab', { name: 'ヒートマップ' }))
    const ySelect = screen.getByRole('combobox', { name: 'Y軸パラメータ' })
    const options = Array.from(ySelect.querySelectorAll('option')).map((o) => o.value)
    expect(options).toEqual(['sma_slow'])
  })

  it('メトリクスの選択肢に主メトリクスと metrics のキーを含む', async () => {
    const user = userEvent.setup()
    renderScreen(makeData(TWO_PARAM_TRIALS))
    await user.click(screen.getByRole('tab', { name: 'ヒートマップ' }))
    const metricSelect = screen.getByRole('combobox', { name: 'メトリクス' })
    const options = Array.from(metricSelect.querySelectorAll('option')).map((o) => o.value)
    expect(options).toContain('sharpe_ratio')
    expect(options).toContain('total_return_pct')
  })

  it('数値パラメータが 1 種以下のときは説明メッセージを表示する', async () => {
    const user = userEvent.setup()
    renderScreen(makeData([
      makeTrial({ sma_fast: 5 }, 1.0),
      makeTrial({ sma_fast: 10 }, 0.5),
    ]))
    await user.click(screen.getByRole('tab', { name: 'ヒートマップ' }))
    expect(
      screen.getByText(
        'ヒートマップ表示には数値パラメータが 2 種類以上必要です（現在 1 種類）',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('optimize-heatmap')).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'X軸パラメータ' })).toBeNull()
  })

  it('散布図タブに戻すと散布図ビューを再表示する', async () => {
    const user = userEvent.setup()
    renderScreen(makeData(TWO_PARAM_TRIALS))
    await user.click(screen.getByRole('tab', { name: 'ヒートマップ' }))
    await user.click(screen.getByRole('tab', { name: '散布図' }))
    expect(screen.getByText('パラメータ感度散布図')).toBeInTheDocument()
    expect(screen.queryByTestId('optimize-heatmap')).toBeNull()
  })
})

/**
 * issue #348: 「試行数: 0」誤表示と optimize run 切替。
 *
 * - 明細（all_trials_json）未保存の run では trials が空でも DB の
 *   n_trials カラム値を試行数として表示し、「明細未保存」の文言を出す
 *   （従来は trials.length=0 を「試行数: 0」と表示し、直下の最良値と矛盾していた）
 * - 複数 run があるときはセレクタで過去 run に切り替えられる
 */
describe('<OptimizeScreen /> n_trials 表示と run 切替 (issue #348)', () => {
  it('明細未保存の run では DB の n_trials を表示し、明細未保存の文言を出す', () => {
    renderScreen(makeData([], { n_trials: 30, best_metric: 0.744 }))
    expect(screen.getByText(/試行数: 30/)).toBeInTheDocument()
    expect(
      screen.getByText(
        'この実行のトライアル明細は保存されていません（試行数と最良値のみ記録されています）',
      ),
    ).toBeInTheDocument()
  })

  it('trials も n_trials も無いときは従来の「データなし」文言を出す', () => {
    renderScreen(makeData([], { n_trials: 0 }))
    expect(screen.getByText(/試行数: 0/)).toBeInTheDocument()
    expect(screen.getByText('最適化トライアルデータがありません')).toBeInTheDocument()
  })

  it('複数 run があるとき、セレクタの選択で onSelectRun が呼ばれる', async () => {
    const user = userEvent.setup()
    const onSelectRun = vi.fn()
    const runs = [
      {
        run_id: 'opt_new',
        run_at: '2026-02-01T00:00:00',
        n_trials: 2,
        best_metric_name: 'sharpe_ratio',
        best_metric_value: 2.0,
      },
      {
        run_id: 'opt_old',
        run_at: '2026-01-01T00:00:00',
        n_trials: 3,
        best_metric_name: 'sharpe_ratio',
        best_metric_value: 1.0,
      },
    ]
    render(
      <OptimizeScreen
        data={makeData(TWO_PARAM_TRIALS, { run_id: 'opt_new', runs })}
        compact={false}
        lang="ja"
        onSelectRun={onSelectRun}
      />,
    )
    const select = screen.getByRole('combobox', { name: '表示する最適化 run を選択' })
    await user.selectOptions(select, 'opt_old')
    expect(onSelectRun).toHaveBeenCalledWith('opt_old')
  })

  it('run が 1 件のときはセレクタを表示しない', () => {
    render(
      <OptimizeScreen
        data={makeData(TWO_PARAM_TRIALS, {
          run_id: 'only',
          runs: [
            {
              run_id: 'only',
              run_at: '2026-01-01T00:00:00',
              n_trials: 3,
              best_metric_name: 'sharpe_ratio',
              best_metric_value: 1.2,
            },
          ],
        })}
        compact={false}
        lang="ja"
        onSelectRun={() => {}}
      />,
    )
    expect(
      screen.queryByRole('combobox', { name: '表示する最適化 run を選択' }),
    ).toBeNull()
  })
})
