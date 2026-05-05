import { useSearchParams } from 'react-router-dom'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'

type ViewKey = 'all' | 'high_sharpe' | 'recent' | 'risky'

interface ViewDef {
  key: ViewKey
  // クリックされたら最終的に URL params がこの値になる（すべて書き換える）
  params: Readonly<Record<string, string>>
}

// 各レンズが「アクティブ」と判定される URL state の定義。
// `params` の全キーが完全一致したら active とみなす（無関係なキーは無視）。
const VIEWS: readonly ViewDef[] = [
  {
    key: 'all',
    params: {},
  },
  {
    key: 'high_sharpe',
    params: { sharpe_min: '1.5', sort: 'latest_sharpe', dir: 'desc' },
  },
  {
    key: 'recent',
    params: { sort: 'last_run_at', dir: 'desc' },
  },
  {
    key: 'risky',
    params: { sort: 'latest_max_drawdown_pct', dir: 'asc' },
  },
] as const

const FILTER_KEYS = ['q', 'symbol', 'tf', 'sharpe_min', 'dd_max', 'sort', 'dir'] as const

interface Props {
  lang: Lang
}

function viewLabel(key: ViewKey, lang: Lang): string {
  const L = makeL(lang)
  switch (key) {
    case 'all':         return L('すべて',         'All')
    case 'high_sharpe': return L('高 Sharpe',      'High Sharpe')
    case 'recent':      return L('最近実行',       'Recent')
    case 'risky':       return L('要注意',         'Risky')
  }
}

function viewDescription(key: ViewKey, lang: Lang): string {
  const L = makeL(lang)
  switch (key) {
    case 'all':         return L('フィルタなし',                       'No filter')
    case 'high_sharpe': return L('Sharpe 1.5 以上を Sharpe 降順で',    'Sharpe ≥ 1.5, sorted by Sharpe')
    case 'recent':      return L('最終実行が新しい順',                 'Sorted by last run desc')
    case 'risky':       return L('Max DD が深い順',                    'Sorted by deepest drawdown')
  }
}

function isActive(view: ViewDef, current: URLSearchParams): boolean {
  // 'all' は「フィルタが何も無い」状態
  if (view.key === 'all') {
    return FILTER_KEYS.every(k => !current.get(k))
  }
  // その他のレンズは params の全キーが一致 + 同じく view.params に無いキーは空
  for (const [k, v] of Object.entries(view.params)) {
    if (current.get(k) !== v) return false
  }
  for (const k of FILTER_KEYS) {
    if (k in view.params) continue
    if (current.get(k)) return false
  }
  return true
}

export function SavedViews({ lang }: Props) {
  const L = makeL(lang)
  const [searchParams, setSearchParams] = useSearchParams()

  const apply = (view: ViewDef): void => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      for (const k of FILTER_KEYS) {
        next.delete(k)
      }
      for (const [k, v] of Object.entries(view.params)) {
        next.set(k, v)
      }
      return next
    }, { replace: true })
  }

  return (
    <div
      role="radiogroup"
      aria-label={L('保存ビュー', 'Saved views')}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-7)',
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        flexWrap: 'wrap',
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
        {L('レンズ', 'Lenses')}
      </span>
      {VIEWS.map(view => {
        const active = isActive(view, searchParams)
        const label = viewLabel(view.key, lang)
        const description = viewDescription(view.key, lang)
        return (
          <button
            key={view.key}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${label}: ${description}`}
            title={description}
            onClick={() => apply(view)}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-pill)',
              border: `1px solid ${active ? 'var(--accent-glow, var(--accent))' : 'var(--border)'}`,
              background: active ? 'var(--accent-bg)' : 'var(--surface-2)',
              color: active ? 'var(--accent)' : 'var(--text2)',
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
              fontWeight: 600,
              letterSpacing: 'var(--tracking-mono)',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'background var(--motion-fast), color var(--motion-fast), border-color var(--motion-fast)',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
