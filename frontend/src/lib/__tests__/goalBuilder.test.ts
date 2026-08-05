import { describe, expect, it } from 'vitest'
import { buildGoalText, GOAL_TYPES, BUILDER_INDICATORS } from '../goalBuilder'

/**
 * issue #489: 自由文でゴールを書けない初中級者向けに、選択式ビルダーから
 * ゴール文を組み立てる。文言の SSoT はこの pure function（日英）。
 */
describe('buildGoalText (issue #489)', () => {
  it('戦略タイプと指標からゴール文を組み立てる（ja）', () => {
    const text = buildGoalText('ja', 'trend_following', ['SMA', 'RSI'])
    expect(text).toContain('トレンドフォロー')
    expect(text).toContain('SMA、RSI')
    expect(text).toContain('Sharpe')
  })

  it('タイプのみでも組み立てられる', () => {
    const text = buildGoalText('ja', 'mean_reversion', [])
    expect(text).toContain('平均回帰')
    expect(text).not.toContain('指標')
  })

  it('指標のみでも組み立てられる', () => {
    const text = buildGoalText('ja', '', ['MACD'])
    expect(text).toContain('MACD')
  })

  it('何も選ばれていなければ空文字（textarea を上書きしない）', () => {
    expect(buildGoalText('ja', '', [])).toBe('')
  })

  it('英語でも組み立てられる', () => {
    const text = buildGoalText('en', 'breakout', ['ATR'])
    expect(text).toContain('breakout')
    expect(text).toContain('ATR')
    expect(text).toContain('Sharpe')
  })

  it('タイプ・指標の候補は空でない（UI の選択肢の SSoT）', () => {
    expect(GOAL_TYPES.length).toBeGreaterThan(0)
    expect(BUILDER_INDICATORS.length).toBeGreaterThan(0)
  })
})
