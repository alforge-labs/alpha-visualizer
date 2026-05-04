import { useState } from 'react'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import type { Variation } from '../hooks/useTheme'
import { NAV, type ScreenId } from './nav'

interface SidebarProps {
  screen: ScreenId
  setScreen: (s: ScreenId) => void
  lang: Lang
  variation: Variation
}

export function Sidebar({ screen, setScreen, lang, variation }: SidebarProps) {
  if (variation === 'terminal') return null
  const wide = variation === 'clarity'
  const L = makeL(lang)
  return (
    <nav
      style={{
        width: wide ? 240 : 200,
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '14px 10px',
        overflowY: 'auto',
      }}
    >
      {NAV.map((n) => (
        <SidebarButton
          key={n.id}
          item={n}
          active={screen === n.id}
          onClick={() => setScreen(n.id)}
          lang={lang}
        />
      ))}

      <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        {wide && (
          <div
            style={{
              marginBottom: 10,
              padding: '10px 12px',
              background: 'var(--surface-h)',
              borderRadius: 7,
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--text3)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              {L('現在の実行', 'Current Run')}
            </div>
            {(
              [
                ['Symbol', 'AAPL'],
                ['Strategy', 'EMA Cross'],
                ['Period', '2020→2024'],
                ['Status', '✓ Complete'],
              ] as const
            ).map(([k, v]) => (
              <div
                key={k}
                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}
              >
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
                  {k}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: 'var(--text2)',
                    fontWeight: 500,
                  }}
                >
                  {v}
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ padding: '8px 11px' }}>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--text2)',
              fontWeight: 600,
            }}
          >
            AAPL · EMA Cross
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
            Sharpe <span style={{ color: '#00e49a', fontWeight: 700 }}>1.18</span> · DD{' '}
            <span style={{ color: '#ff5c5c' }}>−21.4%</span>
          </div>
        </div>
      </div>
    </nav>
  )
}

interface SidebarButtonProps {
  item: (typeof NAV)[number]
  active: boolean
  onClick: () => void
  lang: Lang
}

function SidebarButton({ item, active, onClick, lang }: SidebarButtonProps) {
  const [hover, setHover] = useState(false)
  const bg = active ? 'var(--accent-bg)' : hover ? 'rgba(255,255,255,0.04)' : 'transparent'
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 11px',
        borderRadius: 7,
        border: 'none',
        cursor: 'pointer',
        background: bg,
        transition: 'background 0.12s',
        textAlign: 'left',
        width: '100%',
        marginBottom: 2,
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? '#00e49a' : '#383d5a'}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={item.iconPath} />
      </svg>
      <span
        style={{
          fontFamily: 'var(--sans)',
          fontSize: 13,
          fontWeight: active ? 600 : 400,
          color: active ? '#00e49a' : 'var(--text2)',
          whiteSpace: 'nowrap',
        }}
      >
        {lang === 'ja' ? item.jaLabel : item.enLabel}
      </span>
    </button>
  )
}
