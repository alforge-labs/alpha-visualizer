import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useCompare } from '../hooks/useBacktestData'
import { useViewerSettings } from '../hooks/useTheme'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { CompareScreen } from '../screens/CompareScreen'
import { SettingsToggles } from '../components/SettingsToggles'
import { normalizeErrorMessage } from '../lib/errorMessage'
import { makeL } from '../i18n/strings'
import { Button, Divider, ErrorBanner, Toolbar } from '../design/primitives'

export function ComparePage(): React.ReactElement {
  const { settings, update } = useViewerSettings()
  const { lang, theme } = settings
  useDocumentTitle(lang === 'ja' ? '戦略比較' : 'Compare')
  const L = makeL(lang)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const idsParam = searchParams.get('ids') ?? ''
  const ids = useMemo(() => idsParam.split(',').filter(Boolean), [idsParam])
  // issue #265: エラー時の再試行で同じ ids のまま再フェッチするためのトークン。
  const [reloadToken, setReloadToken] = useState(0)
  const compare = useCompare(ids.length > 0 ? ids : null, reloadToken)

  const removeId = (id: string): void => {
    const next = ids.filter(x => x !== id)
    if (next.length === 0) navigate('/browse')
    else setSearchParams({ ids: next.join(',') }, { replace: true })
  }

  const symbol =
    compare.status === 'ready' && compare.data[0] ? compare.data[0].symbol : '—'

  // ID -> 表示名（ロード後のみ正確、それまでは ID をそのまま表示）
  const labelOf = (id: string): string => {
    if (compare.status !== 'ready') return id
    return compare.data.find(s => s.id === id)?.name ?? id
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--bg)',
        overflow: 'hidden',
      }}
    >
      <Toolbar
        sticky
        leading={
          <Button variant="ghost" size="sm" onClick={() => navigate('/browse')}>
            ← {L('一覧に戻る', 'Back to list')}
          </Button>
        }
        trailing={
          <>
            <SettingsToggles
              lang={lang}
              onSetLang={(l) => update('lang', l)}
              theme={theme}
              onSetTheme={(t) => {
                update('theme', t)
                update('variation', t === 'dark' ? 'lab' : 'atelier')
              }}
            />
            <Divider orientation="vertical" />
            <Button variant="primary" size="sm" onClick={() => navigate('/browse')}>
              + {L('戦略を追加', 'Add strategy')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {ids.map(id => (
            <span
              key={id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 8px 4px 12px',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-pill)',
                fontFamily: 'var(--sans)',
                fontSize: 'var(--fs-caption)',
                color: 'var(--text2)',
                maxWidth: 240,
              }}
            >
              <span
                style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {labelOf(id)}
              </span>
              <button
                type="button"
                onClick={() => removeId(id)}
                aria-label={L('外す', 'Remove')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text3)',
                  fontSize: 14,
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      </Toolbar>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
        }}
      >
        <header
          style={{
            padding: 'var(--layout-gutter-y) var(--layout-gutter) var(--space-5)',
            background: 'var(--bg)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 'var(--fs-caption)',
              fontWeight: 500,
              color: 'var(--text3)',
              letterSpacing: 'var(--tracking-caption)',
              textTransform: 'uppercase',
            }}
          >
            {L('戦略比較', 'Strategy comparison')}
          </div>
          <h1
            style={{
              margin: '6px 0 0 0',
              fontFamily: 'var(--serif)',
              fontSize: 'var(--hero-fs-h1)',
              fontWeight: 700,
              color: 'var(--text)',
              letterSpacing: '-0.01em',
              lineHeight: 1.1,
            }}
          >
            {ids.length > 0
              ? L(`${ids.length}件の戦略を並べる`, `Comparing ${ids.length} strategies`)
              : L('比較する戦略を選んでください', 'Choose strategies to compare')}
          </h1>
          <p
            style={{
              margin: '12px 0 0 0',
              maxWidth: 720,
              fontFamily: 'var(--sans)',
              fontSize: 'var(--fs-body)',
              color: 'var(--text2)',
              lineHeight: 1.55,
            }}
          >
            {L(
              'エクイティの形・リスクとリターンの形・分布の歪みまで、複数戦略を同じ尺度で比較します。',
              'See multiple strategies side by side—equity shape, risk/reward, distribution skew—on the same axes.',
            )}
          </p>
        </header>
        <div style={{ padding: 'var(--space-6) var(--layout-gutter)' }}>
        {compare.status === 'loading' && (
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-md)',
              color: 'var(--text3)',
              letterSpacing: 'var(--tracking-mono)',
              textTransform: 'uppercase',
            }}
          >
            {L('読み込み中…', 'Loading…')}
          </div>
        )}
        {compare.status === 'no_data' && (
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-mono-md)',
              color: 'var(--text3)',
              letterSpacing: 'var(--tracking-mono)',
              padding: '12px 16px',
            }}
          >
            {L(
              '指定した戦略に対応するバックテスト結果が見つかりません',
              'No backtest results found for the selected strategies',
            )}
          </div>
        )}
        {compare.status === 'error' && (
          <ErrorBanner
            message={normalizeErrorMessage(compare.error, lang)}
            title={compare.error}
            retryLabel={L('再試行', 'Retry')}
            onRetry={() => setReloadToken((t) => t + 1)}
          />
        )}
        {compare.status === 'ready' && (
          <CompareScreen data={compare.data} lang={lang} symbol={symbol} />
        )}
        </div>
      </div>
    </div>
  )
}
