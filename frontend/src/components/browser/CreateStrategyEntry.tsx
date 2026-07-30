import { useState } from 'react'
import type { ReactElement } from 'react'
import { useNavigate } from 'react-router'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import type { StrategyListItem } from '../../api/types'
import { Button } from '../../design/primitives'

interface Props {
  strategies: StrategyListItem[]
  lang: Lang
}

/**
 * Browse ヘッダーの新規戦略作成導線（issue #365）。
 *
 * 作成ウィザード（複製ベース #301）は Detail の戦略構成タブ内にあり、
 * 一覧 → 戦略を開く → 戦略構成タブという 3 段の暗黙動線でしか到達できなかった。
 * ここで複製元を選び、`/detail/{id}?tab=strategy` で既存ウィザードへ直行する。
 */
export function CreateStrategyEntry({ strategies, lang }: Props): ReactElement {
  const L = makeL(lang)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [sourceId, setSourceId] = useState('')

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {L('+ 新規戦略（既存から複製）', '+ New strategy (duplicate existing)')}
      </Button>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <label
        htmlFor="create-strategy-source"
        style={{
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-caption)',
          fontWeight: 500,
          color: 'var(--text3)',
          letterSpacing: 'var(--tracking-caption)',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        {L('複製元', 'Source')}
      </label>
      <select
        id="create-strategy-source"
        aria-label={L('複製元の戦略', 'Source strategy to duplicate')}
        value={sourceId}
        onChange={(e) => setSourceId(e.target.value)}
        style={{
          maxWidth: 280,
          padding: '6px 8px',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text)',
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-caption)',
        }}
      >
        <option value="">{L('複製元を選択…', 'Choose a source…')}</option>
        {strategies.map((s) => (
          <option key={s.strategy_id} value={s.strategy_id}>
            {s.name}（{s.strategy_id}）
          </option>
        ))}
      </select>
      <Button
        variant="primary"
        size="sm"
        disabled={!sourceId}
        onClick={() => navigate(`/detail/${encodeURIComponent(sourceId)}?tab=strategy`)}
      >
        {L('作成へ進む', 'Continue')}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        {L('やめる', 'Cancel')}
      </Button>
    </div>
  )
}
