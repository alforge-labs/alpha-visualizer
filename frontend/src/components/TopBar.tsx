import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import type { Density, Theme, Variation } from '../hooks/useTheme'
import { NAV, type ScreenId } from './nav'

interface TopBarProps {
  screen: ScreenId
  setScreen: (s: ScreenId) => void
  lang: Lang
  setLang: (v: Lang) => void
  density: Density
  setDensity: (v: Density) => void
  variation: Variation
  setVariation: (v: Variation) => void
  theme: Theme
  setTheme: (v: Theme) => void
  symbol: string
  strategyName: string
  timeframe: string
}

const VARIATION_LABELS: Record<Variation, string> = {
  atlas: 'Atlas',
  terminal: 'Terminal',
  clarity: 'Clarity',
}

export function TopBar({
  screen,
  setScreen,
  lang,
  setLang,
  density,
  setDensity,
  variation,
  setVariation,
  theme,
  setTheme,
  symbol,
  strategyName,
  timeframe,
}: TopBarProps) {
  const L = makeL(lang)
  return (
    <header
      style={{
        height: 52,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderBottom: '1px solid var(--border)',
        padding: '0 18px',
        background: variation === 'terminal' ? 'var(--bg)' : 'rgba(7,8,13,0.92)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginRight: 8, flexShrink: 0 }}>
        <svg width="22" height="14" viewBox="0 0 22 14" fill="none">
          <polyline
            points="1,13 5,6 8,10 12,3 16,8 21,1"
            stroke="#00e49a"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span
          style={{
            fontFamily: 'var(--sans)',
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '-0.03em',
            color: 'var(--text)',
          }}
        >
          alpha<span style={{ color: '#00e49a' }}>forge</span>
        </span>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--text3)',
            marginLeft: 2,
          }}
        >
          labs
        </span>
      </div>

      {variation === 'terminal' && (
        <div
          style={{
            display: 'flex',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 3,
            gap: 2,
          }}
        >
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setScreen(n.id)}
              style={{
                padding: '5px 11px',
                border: 'none',
                cursor: 'pointer',
                borderRadius: 4,
                transition: 'all 0.12s',
                background: screen === n.id ? 'var(--surface-h)' : 'transparent',
                fontFamily: 'var(--mono)',
                fontSize: 12,
                fontWeight: 500,
                color: screen === n.id ? '#00e49a' : 'var(--text2)',
              }}
            >
              {lang === 'ja' ? n.jaLabel : n.enLabel}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {[symbol, strategyName, timeframe].map((v, i) => (
        <div
          key={i}
          style={{
            height: 30,
            padding: '0 10px',
            borderRadius: 5,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            cursor: 'default',
            flexShrink: 0,
          }}
        >
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)' }}>{v}</span>
          <span style={{ color: 'var(--text3)', fontSize: 11 }}>▾</span>
        </div>
      ))}

      <button
        style={{
          height: 30,
          padding: '0 14px',
          borderRadius: 5,
          background: '#00e49a',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--sans)',
          fontSize: 12,
          fontWeight: 700,
          color: '#07080d',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          flexShrink: 0,
        }}
      >
        <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor">
          <polygon points="1,0.5 8.5,4.5 1,8.5" />
        </svg>
        {L('実行', 'Run')}
      </button>

      <select
        value={variation}
        onChange={(e) => setVariation(e.target.value as Variation)}
        title={L('レイアウト', 'Layout')}
        style={{
          height: 30,
          padding: '0 8px',
          borderRadius: 5,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--text2)',
          fontFamily: 'var(--mono)',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {(Object.keys(VARIATION_LABELS) as Variation[]).map((v) => (
          <option key={v} value={v}>
            {VARIATION_LABELS[v]}
          </option>
        ))}
      </select>

      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        title={theme === 'dark' ? L('ライトテーマ', 'Light mode') : L('ダークテーマ', 'Dark mode')}
        style={{
          height: 30,
          width: 30,
          borderRadius: 5,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          flexShrink: 0,
        }}
      >
        {theme === 'dark' ? '☀' : '🌙'}
      </button>

      <button
        onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
        title={density === 'compact' ? L('通常に戻す', 'Expand') : L('コンパクト表示', 'Compact')}
        style={{
          height: 30,
          width: 30,
          borderRadius: 5,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text2)',
          fontSize: 14,
          flexShrink: 0,
        }}
      >
        {density === 'compact' ? '⊞' : '⊟'}
      </button>

      <button
        onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}
        style={{
          height: 30,
          padding: '0 10px',
          borderRadius: 5,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          fontFamily: 'var(--mono)',
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--text2)',
          flexShrink: 0,
        }}
      >
        {lang === 'ja' ? 'EN' : 'JA'}
      </button>
    </header>
  )
}
