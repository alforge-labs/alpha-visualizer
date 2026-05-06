import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { StrategyListItem } from '../api/types'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import { useDebounce } from '../hooks/useDebounce'
import { useRecentStrategies } from '../hooks/useRecentStrategies'
import {
  buildInitialResults,
  searchStrategies,
  type CommandPaletteResult,
  type MatchReason,
} from '../lib/searchStrategies'

interface Props {
  open: boolean
  onClose: () => void
  lang: Lang
}

const DEBOUNCE_MS = 180

function reasonLabel(reason: MatchReason, L: ReturnType<typeof makeL>): string {
  switch (reason) {
    case 'recent':       return L('最近開いた', 'Recent')
    case 'name':         return L('名前', 'Name')
    case 'strategy_id':  return L('ID', 'ID')
    case 'symbol':       return L('銘柄', 'Symbol')
    case 'tag':          return L('タグ', 'Tag')
  }
}

export function CommandPalette({ open, onClose, lang }: Props): React.ReactElement | null {
  const L = makeL(lang)
  const navigate = useNavigate()
  const { recent, push } = useRecentStrategies()

  const [query, setQuery] = useState<string>('')
  const debouncedQuery = useDebounce(query, DEBOUNCE_MS)
  const [items, setItems] = useState<StrategyListItem[]>([])
  const [loaded, setLoaded] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<number>(0)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const listboxId = useId()

  // open=false のときは下のガードで早期 return するため、ここで取得処理を走らせない。
  // open=true で初回 mount 時に一度だけ戦略一覧を取得する。
  useEffect(() => {
    if (!open || loaded) return
    let cancelled = false
    api.listStrategies()
      .then(data => {
        if (cancelled) return
        setItems(data)
        setLoaded(true)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setLoaded(true)
      })
    return () => { cancelled = true }
  }, [open, loaded])

  // 初回 mount 時に input にフォーカス。リセットは親が unmount → mount で行う。
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open])

  const results = useMemo<CommandPaletteResult[]>(() => {
    const q = debouncedQuery.trim()
    if (q === '') return buildInitialResults(items, recent)
    return searchStrategies(items, q)
  }, [items, recent, debouncedQuery])

  // 結果数が縮んでも index は範囲内に収める（render 時に派生）。
  const effectiveHighlighted = results.length === 0 ? 0 : Math.min(highlighted, results.length - 1)

  const select = useCallback((idx: number): void => {
    const r = results[idx]
    if (!r) return
    push(r.item.strategy_id)
    onClose()
    navigate(`/detail/${encodeURIComponent(r.item.strategy_id)}`)
  }, [results, push, navigate, onClose])

  // グローバル Escape リスナー: open 中のみ有効。
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(Math.min(effectiveHighlighted + 1, Math.max(results.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(Math.max(effectiveHighlighted - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      select(effectiveHighlighted)
    }
  }

  return (
    <div
      data-testid="command-palette-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'color-mix(in srgb, var(--bg) 70%, transparent)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '12vh',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={L('戦略を検索', 'Search strategies')}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(640px, 92vw)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg, 12px)',
          boxShadow: '0 24px 64px color-mix(in srgb, var(--text) 14%, transparent)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span
            aria-hidden
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-sm)',
              color: 'var(--text3)',
              letterSpacing: 'var(--tracking-mono)',
            }}
          >
            ⌘K
          </span>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-controls={listboxId}
            aria-expanded
            aria-autocomplete="list"
            aria-activedescendant={
              results[effectiveHighlighted]
                ? `${listboxId}-option-${results[effectiveHighlighted].item.strategy_id}`
                : undefined
            }
            placeholder={L('戦略名・銘柄・タグで検索…', 'Search strategies, symbols, tags…')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setHighlighted(0)
            }}
            onKeyDown={handleInputKeyDown}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'var(--text)',
              fontFamily: 'var(--sans)',
              fontSize: '1rem',
            }}
          />
        </div>

        <ul
          id={listboxId}
          role="listbox"
          aria-label={L('検索結果', 'Search results')}
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            maxHeight: '52vh',
            overflowY: 'auto',
          }}
        >
          {error && (
            <li
              role="alert"
              style={{
                padding: '14px 16px',
                color: 'var(--danger)',
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-sm)',
              }}
            >
              {error}
            </li>
          )}
          {!error && results.length === 0 && (
            <li
              style={{
                padding: '20px 16px',
                color: 'var(--text3)',
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-sm)',
                letterSpacing: 'var(--tracking-mono)',
                textTransform: 'uppercase',
              }}
            >
              {L('該当なし', 'No matches')}
            </li>
          )}
          {results.map((r, idx) => {
            const selected = idx === effectiveHighlighted
            return (
              <li
                key={r.item.strategy_id}
                id={`${listboxId}-option-${r.item.strategy_id}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setHighlighted(idx)}
                onClick={() => select(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 16px',
                  cursor: 'pointer',
                  background: selected ? 'var(--accent-bg)' : 'transparent',
                  borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span
                    style={{
                      fontFamily: 'var(--serif)',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      color: 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.item.name}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 'var(--fs-mono-sm)',
                      color: 'var(--text3)',
                      letterSpacing: 'var(--tracking-mono)',
                    }}
                  >
                    {r.item.strategy_id}
                    {r.item.symbol ? `  •  ${r.item.symbol}` : ''}
                  </span>
                </div>
                <span
                  style={{
                    flexShrink: 0,
                    fontFamily: 'var(--mono)',
                    fontSize: 'var(--fs-mono-sm)',
                    color: 'var(--text3)',
                    letterSpacing: 'var(--tracking-mono)',
                    textTransform: 'uppercase',
                  }}
                >
                  {reasonLabel(r.reason, L)}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
