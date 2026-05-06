export interface RegimeBand {
  state: number
  startIdx: number
  endIdx: number
}

/**
 * 隣接同値を 1 つの帯に集約する。境界は両端を含む半閉区間 [startIdx, endIdx]。
 * 例: [0,0,1,1,1,0] → [{0,0,1},{1,2,4},{0,5,5}]
 */
export function buildRegimeBands(states: ReadonlyArray<number>): RegimeBand[] {
  const bands: RegimeBand[] = []
  if (states.length === 0) return bands
  let curState = states[0] as number
  let curStart = 0
  for (let i = 1; i < states.length; i++) {
    const s = states[i] as number
    if (s !== curState) {
      bands.push({ state: curState, startIdx: curStart, endIdx: i - 1 })
      curState = s
      curStart = i
    }
  }
  bands.push({ state: curState, startIdx: curStart, endIdx: states.length - 1 })
  return bands
}
