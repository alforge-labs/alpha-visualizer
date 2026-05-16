import { useState } from 'react'
import type { ConditionNode, EntryExitConditions, IndicatorConfig, LeafConditionNode, RiskManagement, StrategyDetail, Trade, VariableConfig } from '../api/types'
import { isLogicalConditionNode } from '../api/types'
import { Card, Chip, SectionHeader, SectionLabel } from '../design/primitives'
import type { Lang } from '../i18n/strings'
import { makeL } from '../i18n/strings'
import { SignalChartCard } from './strategy/SignalChartCard'

interface StrategyScreenProps {
  data: StrategyDetail
  lang: Lang
  /** バックテスト結果から渡される銘柄シンボル（取得前なら null）。SignalChartCard が OHLC fetch に使う。 */
  symbol: string | null
  /** バックテスト結果から渡される trades。SignalChartCard が markers / priceLine に使う。 */
  trades: Trade[]
}

export function StrategyScreen({ data, lang, symbol, trades }: StrategyScreenProps) {
  const L = makeL(lang)
  return (
    <div data-testid="strategy-screen" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', paddingTop: 'var(--space-5)' }}>
      <SignalChartCard symbol={symbol} trades={trades} lang={lang} />
      <ParametersCard parameters={data.parameters} lang={lang} />
      <IndicatorsCard indicators={data.indicators} lang={lang} />
      {(data.entry_conditions || data.exit_conditions) && (
        <ConditionsCard
          entry={data.entry_conditions}
          exit={data.exit_conditions}
          lang={lang}
        />
      )}
      {data.risk_management && (
        <RiskManagementCard risk={data.risk_management} lang={lang} />
      )}
      {data.variables.length > 0 && (
        <VariablesCard variables={data.variables} lang={lang} />
      )}
      {data.regime_config && (
        <RegimeCard config={data.regime_config} lang={lang} />
      )}
      {!data.indicators.length && !data.entry_conditions && !data.exit_conditions && !data.risk_management && !data.regime_config && (
        <EmptyNote>{L('戦略構造の情報がありません', 'No strategy structure available')}</EmptyNote>
      )}
    </div>
  )
}

function CollapseToggle({
  open,
  onToggle,
  lang,
}: {
  open: boolean
  onToggle: () => void
  lang: Lang
}) {
  const L = makeL(lang)
  return (
    <button
      onClick={onToggle}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'var(--mono)',
        fontSize: 'var(--fs-mono-sm)',
        color: 'var(--text3)',
        letterSpacing: 'var(--tracking-mono)',
        padding: '2px 8px',
      }}
    >
      {open ? L('▲ 折りたたむ', '▲ Collapse') : L('▼ 展開', '▼ Expand')}
    </button>
  )
}

function ParametersCard({ parameters, lang }: { parameters: Record<string, unknown>; lang: Lang }) {
  const L = makeL(lang)
  const [open, setOpen] = useState(true)
  const entries = Object.entries(parameters)
  if (entries.length === 0) return null
  return (
    <Card>
      <SectionHeader
        title={L('パラメータ', 'Parameters')}
        small
        right={<CollapseToggle open={open} onToggle={() => setOpen(v => !v)} lang={lang} />}
      />
      {open && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          {entries.map(([key, val]) => (
            <ParamItem key={key} name={key} value={val} />
          ))}
        </div>
      )}
    </Card>
  )
}

function ParamItem({ name, value }: { name: string; value: unknown }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 'var(--fs-mono-sm)', color: 'var(--text3)', letterSpacing: 'var(--tracking-mono)', textTransform: 'uppercase' }}>
        {name}
      </span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>
        {String(value)}
      </span>
    </div>
  )
}

function IndicatorsCard({ indicators, lang }: { indicators: IndicatorConfig[]; lang: Lang }) {
  const L = makeL(lang)
  const [open, setOpen] = useState(true)
  if (indicators.length === 0) return null

  const grouped = indicators.reduce<Record<string, IndicatorConfig[]>>((acc, ind) => {
    const key = ind.type
    if (!acc[key]) acc[key] = []
    acc[key]!.push(ind)
    return acc
  }, {})

  return (
    <Card>
      <SectionHeader
        title={L('指標', 'Indicators')}
        caption={L(`${indicators.length} 件`, `${indicators.length} total`)}
        small
        right={<CollapseToggle open={open} onToggle={() => setOpen(v => !v)} lang={lang} />}
      />
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {Object.entries(grouped).map(([type, inds]) => (
            <div key={type}>
              <SectionLabel>{type}</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {inds.map(ind => <IndicatorRow key={ind.id} indicator={ind} lang={lang} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function IndicatorRow({ indicator, lang }: { indicator: IndicatorConfig; lang: Lang }) {
  const L = makeL(lang)
  const paramStr = Object.entries(indicator.params)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(', ')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', minWidth: 120 }}>
        {indicator.id}
      </span>
      {paramStr && (
        <span style={{ fontFamily: 'var(--mono)', fontSize: 'var(--fs-mono-sm)', color: 'var(--text3)' }}>
          ({paramStr})
        </span>
      )}
      {indicator.lock_on_entry && (
        <Chip tone="warning">{L('entry ロック', 'lock on entry')}</Chip>
      )}
    </div>
  )
}

function ConditionsCard({ entry, exit, lang }: { entry: EntryExitConditions | null; exit: EntryExitConditions | null; lang: Lang }) {
  const L = makeL(lang)
  const [open, setOpen] = useState(true)
  return (
    <Card>
      <SectionHeader
        title={L('エントリー / エグジット条件', 'Entry / Exit Conditions')}
        small
        right={<CollapseToggle open={open} onToggle={() => setOpen(v => !v)} lang={lang} />}
      />
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {entry && <ConditionSection title={L('エントリー', 'Entry')} conditions={entry} lang={lang} />}
          {exit && <ConditionSection title={L('エグジット', 'Exit')} conditions={exit} lang={lang} />}
        </div>
      )}
    </Card>
  )
}

function ConditionSection({ title, conditions, lang }: { title: string; conditions: EntryExitConditions; lang: Lang }) {
  const L = makeL(lang)
  const sides = Object.entries(conditions)
  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      <div style={{ display: 'flex', gap: 'var(--space-5)', flexWrap: 'wrap' }}>
        {sides.map(([side, node]) => (
          <div key={side} style={{ flex: '1 1 280px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 'var(--fs-mono-sm)', color: 'var(--accent)', marginBottom: 'var(--space-2)', textTransform: 'uppercase' }}>
              {side === 'long' ? L('ロング', 'Long') : side === 'short' ? L('ショート', 'Short') : side}
            </div>
            {node && <ConditionTree node={node} depth={0} />}
          </div>
        ))}
      </div>
    </div>
  )
}

function ConditionTree({ node, depth }: { node: ConditionNode; depth: number }) {
  const indentPx = depth * 16

  if (isLogicalConditionNode(node)) {
    return (
      <div style={{ paddingLeft: indentPx }}>
        <LogicLabel type={node.type} />
        <div style={{ marginTop: 4 }}>
          {node.conditions.map((child, i) => (
            <ConditionTree key={i} node={child} depth={depth + 1} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ paddingLeft: indentPx, marginBottom: 4 }}>
      <LeafCondition node={node} />
    </div>
  )
}

function LogicLabel({ type }: { type: 'AND' | 'OR' }) {
  const isAnd = type === 'AND'
  return (
    <span style={{
      display: 'inline-block',
      fontFamily: 'var(--mono)',
      fontSize: 'var(--fs-mono-sm)',
      fontWeight: 700,
      color: isAnd ? 'var(--accent)' : 'var(--warn)',
      letterSpacing: 'var(--tracking-mono)',
      marginBottom: 2,
    }}>
      {type}
    </span>
  )
}

function LeafCondition({ node }: { node: LeafConditionNode }) {
  const parts: string[] = []
  if (node.left !== undefined) parts.push(String(node.left))
  if (node.type) parts.push(node.type)
  if (node.right !== undefined && node.right !== null) parts.push(String(node.right))
  const text = parts.length > 0 ? parts.join(' ') : JSON.stringify(node)
  return (
    <span style={{
      fontFamily: 'var(--mono)',
      fontSize: 'var(--fs-mono-sm)',
      color: 'var(--text2)',
      display: 'block',
      paddingLeft: 8,
      borderLeft: '2px solid var(--border)',
    }}>
      {text}
    </span>
  )
}

function RiskManagementCard({ risk, lang }: { risk: RiskManagement; lang: Lang }) {
  const L = makeL(lang)
  return (
    <Card>
      <SectionHeader title={L('リスク管理', 'Risk Management')} small />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        {risk.sl_pct != null && (
          <Chip tone="negative">SL {risk.sl_pct}%</Chip>
        )}
        {risk.tp_pct != null && (
          <Chip tone="positive">TP {risk.tp_pct}%</Chip>
        )}
        {risk.trailing_stop && (
          <Chip tone="warning">{L('トレーリング', 'Trailing')}</Chip>
        )}
        {risk.position_size_pct != null && (
          <Chip tone="neutral">{L('サイズ', 'Size')} {risk.position_size_pct}%</Chip>
        )}
        {risk.max_positions != null && (
          <Chip tone="neutral">{L('最大', 'Max')} {risk.max_positions} pos</Chip>
        )}
        {Object.entries(risk)
          .filter(([k]) => !['sl_pct', 'tp_pct', 'trailing_stop', 'position_size_pct', 'max_positions'].includes(k))
          .map(([k, v]) => (
            <Chip key={k} tone="neutral">{k}: {String(v)}</Chip>
          ))}
      </div>
    </Card>
  )
}

function VariablesCard({ variables, lang }: { variables: VariableConfig[]; lang: Lang }) {
  const L = makeL(lang)
  const [open, setOpen] = useState(false)
  return (
    <Card>
      <SectionHeader
        title={L('変数', 'Variables')}
        caption={L(`${variables.length} 件`, `${variables.length} total`)}
        small
        right={<CollapseToggle open={open} onToggle={() => setOpen(v => !v)} lang={lang} />}
      />
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {variables.map(v => (
            <div key={v.id} style={{ display: 'flex', gap: 'var(--space-3)', fontFamily: 'var(--mono)', fontSize: 'var(--fs-mono-sm)', borderBottom: '1px solid var(--border)', paddingBottom: 'var(--space-2)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text)', minWidth: 120 }}>{v.id}</span>
              <span style={{ color: 'var(--text3)' }}>{v.expression}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function RegimeCard({ config, lang }: { config: Record<string, unknown>; lang: Lang }) {
  const L = makeL(lang)
  const [open, setOpen] = useState(true)
  return (
    <Card>
      <SectionHeader
        title={L('レジーム設定', 'Regime Config')}
        small
        right={<CollapseToggle open={open} onToggle={() => setOpen(v => !v)} lang={lang} />}
      />
      {open && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          {Object.entries(config).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 'var(--fs-mono-sm)', color: 'var(--text3)', textTransform: 'uppercase' }}>{k}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'var(--mono)', fontSize: 'var(--fs-mono-sm)', color: 'var(--text3)', padding: 'var(--space-6) 0' }}>
      {children}
    </div>
  )
}
