import { useEffect, useId, useRef, useState } from 'react'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { METRIC_DEFINITIONS } from '../../constants/metricDefinitions'

interface Props {
  /** METRIC_DEFINITIONS のキー。未定義キーなら何も描画しない */
  defKey: string
  lang: Lang
}

const TIP_W = 320

/**
 * 指標説明ツールチップの共通機構（issue #360）。
 *
 * hover 限定だった従来実装と異なり button として実装し、click / focus でも
 * 開けるためタッチ端末・キーボードでも説明に到達できる。開いている間は
 * aria-describedby でツールチップ本文を参照し、支援技術にも説明が伝わる。
 */
export function MetricInfoTip({ defKey, lang }: Props) {
  const def = METRIC_DEFINITIONS[defKey]
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const tipId = useId()
  const L = makeL(lang)
  const open = pos !== null

  useEffect(() => {
    if (!open) return
    const hide = () => setPos(null)
    window.addEventListener('scroll', hide, true)
    return () => window.removeEventListener('scroll', hide, true)
  }, [open])

  if (!def) return null

  const show = () => {
    const rect = btnRef.current?.getBoundingClientRect()
    setPos({ x: rect?.left ?? 0, y: (rect?.bottom ?? 0) + 4 })
  }

  // モバイル/狭幅で右端からはみ出さないようクランプ
  const left = pos ? Math.max(8, Math.min(pos.x, window.innerWidth - TIP_W - 8)) : 0

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={L(`${def.label}の説明`, `About ${def.labelEn}`)}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onMouseEnter={show}
        onMouseLeave={() => setPos(null)}
        onFocus={show}
        onBlur={() => setPos(null)}
        onClick={show}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setPos(null)
        }}
        style={{
          appearance: 'none',
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          fontSize: 11,
          lineHeight: 1,
          color: 'var(--text3)',
          cursor: 'help',
          opacity: 0.55,
        }}
      >
        ⓘ
      </button>
      {open && (
        <div
          id={tipId}
          role="tooltip"
          style={{
            position: 'fixed',
            left,
            top: pos.y,
            zIndex: 100,
            background: 'var(--surface)',
            border: '1px solid var(--border-h)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3) var(--space-4)',
            maxWidth: TIP_W,
            boxShadow: 'var(--shadow-2)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 'var(--fs-body)',
              color: 'var(--text)',
              lineHeight: 1.45,
            }}
          >
            {L(def.description, def.descriptionEn)}
          </div>
          {def.formula && (
            <div
              style={{
                marginTop: 6,
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-sm)',
                color: 'var(--text3)',
                letterSpacing: 'var(--tracking-mono)',
              }}
            >
              {def.formula}
            </div>
          )}
        </div>
      )}
    </>
  )
}
