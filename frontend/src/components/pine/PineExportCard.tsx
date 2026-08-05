import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { PineScriptResponse, PineSupportResponse } from '../../api/types'
import type { Lang } from '../../i18n/strings'
import { makeL } from '../../i18n/strings'
import { downloadTextFile } from '../../lib/download'
import { extractApiErrorDetail } from '../../lib/errorMessage'
import { Button } from '../../design/primitives'

const CARD_STYLE: React.CSSProperties = {
  padding: 'var(--space-4)',
  marginTop: 'var(--space-4)',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
}

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: 'var(--fs-caption)',
  fontWeight: 500,
  color: 'var(--text3)',
  letterSpacing: 'var(--tracking-caption)',
  textTransform: 'uppercase',
}

const SCRIPT_STYLE: React.CSSProperties = {
  margin: 'var(--space-3) 0 0',
  padding: 'var(--space-3)',
  maxHeight: 320,
  overflow: 'auto',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-mono-sm)',
  color: 'var(--text2)',
  whiteSpace: 'pre',
}

interface Props {
  strategyId: string
  lang: Lang
}

/**
 * Pine Script エクスポートカード（issue #487 / #488）。
 *
 * 「TradingView へ出力」— `POST /api/pine/{id}`（`pine preview` 委譲）で
 * Pine v6 本文を取得し、プレビュー・コピー・`.pine` ダウンロードを提供する。
 *
 * 生成前に非対応指標を警告する（#488）: 非対応指標は Pine 側で na 化され、
 * それに依存する条件はエントリーしなくなる。「TradingView に持って行ったら
 * 動きが違う」という混乱を出力前に防ぐ。対応チェックの取得に失敗したときは
 * 警告なしで生成を妨げない（縮退）。生成成功後は貼り付け手順を案内する。
 * Trial の entitlement エラーは translate 済みの detail（アップグレード +
 * 認証復帰導線入り）をそのまま表示する。
 */
export function PineExportCard({ strategyId, lang }: Props) {
  const L = makeL(lang)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PineScriptResponse | null>(null)
  const [copied, setCopied] = useState(false)
  const [support, setSupport] = useState<PineSupportResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .getPineSupport(strategyId)
      .then((s) => {
        if (!cancelled) setSupport(s)
      })
      .catch(() => {
        // 対応チェックできなくても生成は妨げない（誤警告よりも縮退を優先）
        if (!cancelled) setSupport(null)
      })
    return () => {
      cancelled = true
    }
  }, [strategyId])

  const handleGenerate = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      setResult(await api.generatePine(strategyId))
    } catch (e: unknown) {
      setResult(null)
      // entitlement 拒否等はサーバー detail がユーザー向け文言なので抽出して表示
      setError(
        extractApiErrorDetail(e instanceof Error ? e.message : String(e), lang),
      )
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = async (): Promise<void> => {
    if (result == null) return
    try {
      await navigator.clipboard.writeText(result.script)
      setCopied(true)
    } catch {
      // clipboard API が使えない環境（非 HTTPS 等）はプレビューから手動コピー
      setCopied(false)
    }
  }

  return (
    <section style={CARD_STYLE} aria-label={L('TradingView へ出力', 'Export to TradingView')}>
      <p style={{ ...LABEL_STYLE, margin: 0 }}>
        {L('TradingView へ出力', 'Export to TradingView')}
      </p>
      <p
        style={{
          margin: 'var(--space-2) 0',
          fontFamily: 'var(--sans)',
          fontSize: 'var(--fs-caption)',
          color: 'var(--text3)',
        }}
      >
        {L(
          'この戦略から TradingView 用の Pine Script（v6）を生成します。生成した内容をコピーまたはダウンロードして、TradingView の Pine エディタに貼り付けてください。',
          'Generates TradingView Pine Script (v6) from this strategy. Copy or download the output and paste it into the TradingView Pine editor.',
        )}
      </p>
      {support != null && support.unsupported_types.length > 0 && (
        <div
          role="note"
          style={{
            margin: '0 0 var(--space-3)',
            padding: 'var(--space-3)',
            border: `1px solid ${support.all_unsupported ? 'var(--danger)' : 'var(--warn)'}`,
            borderRadius: 'var(--radius-sm)',
            background: `color-mix(in srgb, ${support.all_unsupported ? 'var(--danger)' : 'var(--warn)'} 8%, transparent)`,
            fontFamily: 'var(--sans)',
            fontSize: 'var(--fs-caption)',
            color: 'var(--text2)',
          }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>
            {support.all_unsupported
              ? L(
                  'この戦略の指標はすべて Pine 非対応です。生成しても TradingView では機能しません。',
                  'All indicators in this strategy are unsupported in Pine. The output will not function on TradingView.',
                )
              : L(
                  '一部の指標が Pine 非対応です。',
                  'Some indicators are unsupported in Pine.',
                )}
          </p>
          <p style={{ margin: 'var(--space-1) 0 0' }}>
            {L(
              '非対応の指標は Pine 側で無効化（na 化）され、これらに依存する条件はエントリーしません: ',
              'Unsupported indicators are disabled (na) in Pine, and conditions depending on them will not enter: ',
            )}
            <span style={{ fontFamily: 'var(--mono)' }}>
              {support.unsupported_types.join(', ')}
            </span>
          </p>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button onClick={() => void handleGenerate()} disabled={busy}>
          {busy
            ? L('生成中…', 'Generating…')
            : L('Pine Script を生成', 'Generate Pine Script')}
        </Button>
        {result != null && (
          <>
            <Button onClick={() => void handleCopy()}>
              {copied ? L('コピーしました', 'Copied') : L('コピー', 'Copy')}
            </Button>
            <Button onClick={() => downloadTextFile(result.filename, result.script)}>
              {L('ダウンロード', 'Download')}
            </Button>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-mono-sm)',
                color: 'var(--text3)',
              }}
            >
              {result.filename}
            </span>
          </>
        )}
      </div>
      {error && (
        <p
          role="alert"
          style={{
            margin: 'var(--space-2) 0 0',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-mono-sm)',
            color: 'var(--danger)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {error}
        </p>
      )}
      {result != null && (
        <ol
          style={{
            margin: 'var(--space-3) 0 0',
            paddingLeft: '1.4em',
            fontFamily: 'var(--sans)',
            fontSize: 'var(--fs-caption)',
            color: 'var(--text3)',
          }}
        >
          <li>
            {L(
              'TradingView でチャートを開き、画面下部の「Pine エディタ」を開く',
              'Open a chart on TradingView and open the "Pine Editor" at the bottom',
            )}
          </li>
          <li>
            {L(
              'エディタの内容をすべて消し、上の「コピー」で取得した内容を貼り付ける',
              'Clear the editor and paste the content from the "Copy" button above',
            )}
          </li>
          <li>
            {L(
              '「チャートに追加」を押す（アラート運用はスクリプト保存後に設定できます）',
              'Press "Add to chart" (alerts can be configured after saving the script)',
            )}
          </li>
        </ol>
      )}
      {result != null && <pre style={SCRIPT_STYLE}>{result.script}</pre>}
    </section>
  )
}
