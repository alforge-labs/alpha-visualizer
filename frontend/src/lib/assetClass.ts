/**
 * シンボル文字列から資産クラスを推定する。
 * yfinance / OANDA / カスタム表記を素朴に分類するヘルパー。
 */

export type AssetClass = 'index' | 'etf' | 'stock' | 'fx' | 'commodity' | 'other'

export const ASSET_CLASS_ORDER: readonly AssetClass[] = [
  'index', 'etf', 'stock', 'fx', 'commodity', 'other',
] as const

export const ASSET_CLASS_LABEL: Record<AssetClass, { ja: string; en: string }> = {
  index:     { ja: '指数',         en: 'Indices' },
  etf:       { ja: 'ETF',          en: 'ETFs' },
  stock:     { ja: '個別銘柄',     en: 'Stocks' },
  fx:        { ja: 'FX',           en: 'Forex' },
  commodity: { ja: 'コモディティ', en: 'Commodities' },
  other:     { ja: 'その他',       en: 'Other' },
}

// 既知 ETF（米国主要・セクター・レバレッジ含む）
const ETF_TICKERS = new Set<string>([
  'SPY', 'QQQ', 'TQQQ', 'SQQQ', 'VOO', 'VTI', 'IVV', 'VEA', 'VWO',
  'EFA', 'EEM', 'IWM', 'DIA', 'GLD', 'SLV', 'TLT', 'IEF', 'HYG',
  'LQD', 'XLF', 'XLE', 'XLK', 'XLI', 'XLP', 'XLY', 'XLV', 'XLU',
  'XBI', 'SOXL', 'SOXX', 'ARKK', 'SH', 'UVXY', 'AGG', 'BND',
])

// CFD 表記の指数（OANDA / IG / GMO 等）
const CFD_INDEX_SYMBOLS = new Set<string>([
  'NAS100', 'SPX500', 'US30', 'US500', 'UK100', 'GER40', 'GER30',
  'JPN225', 'HK50', 'AUS200', 'FRA40', 'EU50',
])

// 既知のスポット系コモディティ（XAU=金、XAG=銀、XPT=プラチナ、XPD=パラジウム、XBT=ビットコイン CFD）
const SPOT_COMMODITY_SYMBOLS = new Set<string>([
  'XAU', 'XAG', 'XPT', 'XPD', 'XBT',
])

const FX_PAIR_RE = /^[A-Z]{6}(=X|_X)$/i

export function classifySymbol(symbol: string | null | undefined): AssetClass {
  if (!symbol) return 'other'
  const s = symbol.trim()
  if (!s) return 'other'
  const upper = s.toUpperCase()

  // 指数（yfinance: ^GSPC, ^N225, ^NDX 等）
  if (s.startsWith('^')) return 'index'

  // CFD 表記の指数
  if (CFD_INDEX_SYMBOLS.has(upper)) return 'index'

  // FX: yfinance/カスタム形式 (EURUSD=X, USDJPY_X)
  if (FX_PAIR_RE.test(s)) return 'fx'

  // 先物（yfinance: CL=F, GC=F, HG=F, SI=F, ZC=F 等）→ コモディティ
  if (s.endsWith('=F')) return 'commodity'

  // スポット系コモディティ
  if (SPOT_COMMODITY_SYMBOLS.has(upper)) return 'commodity'

  // ETF（既知リスト）
  if (ETF_TICKERS.has(upper)) return 'etf'

  // 残り：英字／数字／ピリオド／ハイフンのみ → 個別銘柄
  if (/^[A-Z][A-Z0-9.-]*$/i.test(s)) return 'stock'

  return 'other'
}
