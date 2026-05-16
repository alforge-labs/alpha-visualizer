import { api } from '../api/client'
import type { HistoricalResponse } from '../api/types'
import { type LoadState, useFetchByKey } from './useFetchByKey'

/**
 * `${symbol}|${interval}` を fetch key として OHLC 時系列を取得する fetcher。
 * useFetchByKey の依存配列要件（fetcher は安定参照）を満たすため
 * モジュールトップで一度だけ生成する。
 */
const HISTORICAL_FETCHER = (key: string): Promise<HistoricalResponse> => {
  // useFetchByKey に渡す key は必ず `${symbol}|${interval}` 形式（呼び出し側で保証）
  const [symbol = '', interval = '1d'] = key.split('|')
  return api.getHistorical(symbol, interval)
}

/**
 * StrategyScreen 等で使う OHLC 時系列フック。
 *
 * - `symbol` が null/empty なら `{ status: 'loading' }`
 * - 404 は `{ status: 'no_data' }`（useFetchByKey の既定挙動）
 * - 取得失敗は `{ status: 'error' }`
 * - 取得成功は `{ status: 'ready', data: HistoricalResponse, isMock: false }`
 *
 * `interval` 切替時は key が変わるため自動的に再 fetch される。
 *
 * @param symbol 銘柄シンボル（null/empty で fetch しない）
 * @param interval 時間足（既定 '1d'）。backend whitelist と一致する値のみ受理される
 */
export function useStrategyHistorical(
  symbol: string | null | undefined,
  interval: string = '1d',
): LoadState<HistoricalResponse> {
  const key = symbol ? `${symbol}|${interval}` : null
  return useFetchByKey<HistoricalResponse>(key, HISTORICAL_FETCHER)
}
