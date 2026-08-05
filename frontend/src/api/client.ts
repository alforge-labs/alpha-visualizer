import type { AgentBackendsResponse, BacktestDetail, BacktestSummary, CreateAgentJobParams, CreateDataJobParams, CreateJobParams, DataListResponse, DuplicateStrategyResult, HealthResponse, HistoricalResponse, IdeaItem, JobDetail, JobSummary, LiveDetailResponse, LiveListItem, OptimizeResult, OrphanRunsResponse, PineScriptResponse, PineSupportResponse, PruneOrphansResponse, RunBacktestResult, SaveParametersResult, SetupStatusResponse, SparklineResponse, StrategyComparison, StrategyDetail, StrategyListItem, StrategyRun, WFOResult } from './types'

const API_BASE = '/api'

class ApiError extends Error {
  readonly status: number
  readonly url: string
  constructor(message: string, status: number, url: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.url = url
  }
}

async function requestUrl<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new ApiError(`API ${res.status}: ${text || res.statusText}`, res.status, url)
  }
  return (await res.json()) as T
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return requestUrl<T>(`${API_BASE}${path}`, init)
}

export const api = {
  getBacktest: (runId: string): Promise<BacktestDetail> =>
    request<BacktestDetail>(`/results/${encodeURIComponent(runId)}`),

  getWFO: (strategyId: string): Promise<WFOResult> =>
    request<WFOResult>(`/wfo/${encodeURIComponent(strategyId)}`),

  getOptimize: (strategyId: string, runId?: string): Promise<OptimizeResult> =>
    request<OptimizeResult>(
      `/optimize/${encodeURIComponent(strategyId)}` +
        (runId ? `?run_id=${encodeURIComponent(runId)}` : ''),
    ),

  compareStrategies: (ids: string[]): Promise<StrategyComparison[]> =>
    request<StrategyComparison[]>(`/strategies/compare?ids=${encodeURIComponent(ids.join(','))}`),

  listStrategies: (): Promise<StrategyListItem[]> =>
    request<StrategyListItem[]>('/strategies'),

  // Browse 行ホバー用の軽量 sparkline（#387）。フル詳細 2MB を引かない
  getSparkline: (strategyId: string): Promise<SparklineResponse> =>
    request<SparklineResponse>(`/strategies/${encodeURIComponent(strategyId)}/sparkline`),

  // 全 run 横断一覧（#374 Runs ページ）。スカラー列のみの軽量応答（#384）
  listResults: (): Promise<BacktestSummary[]> => request<BacktestSummary[]>('/results'),

  // 保有ヒストリカルデータ一覧（#484 データ管理画面）
  listDatasets: (): Promise<DataListResponse> => request<DataListResponse>('/data'),

  // セットアップ状態の集約チェック（#492 「はじめる」画面）
  getSetupStatus: (): Promise<SetupStatusResponse> =>
    request<SetupStatusResponse>('/setup/status'),

  // データ取得・更新ジョブ（#485）。観察・キャンセルは /api/jobs 系を共用
  createDataJob: (params: CreateDataJobParams): Promise<JobSummary> =>
    request<JobSummary>('/data/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }),

  // Pine Script 生成（#487）。pine preview 委譲で本文を返す
  generatePine: (strategyId: string): Promise<PineScriptResponse> =>
    request<PineScriptResponse>(`/pine/${encodeURIComponent(strategyId)}`, {
      method: 'POST',
    }),

  // 生成前の非対応指標チェック（#488）。対応表の SSoT は forge 側
  getPineSupport: (strategyId: string): Promise<PineSupportResponse> =>
    request<PineSupportResponse>(`/pine/${encodeURIComponent(strategyId)}/support`),

  // /health は /api 配下でない唯一の JSON エンドポイント（バージョン表示 #399）
  getHealth: (): Promise<HealthResponse> => requestUrl<HealthResponse>('/health'),

  // backend に専用 /runs エンドポイントが無いため、/strategies/{id} の results を整形して返す
  getStrategyRuns: async (strategyId: string): Promise<StrategyRun[]> => {
    interface StrategyResultRow {
      run_id?: string | null
      run_at?: string | null
      sharpe?: number | null
      return_pct?: number | null
      max_drawdown_pct?: number | null
      source?: string | null
    }
    interface StrategyDetailLite {
      results?: StrategyResultRow[]
    }
    const detail = await request<StrategyDetailLite>(
      `/strategies/${encodeURIComponent(strategyId)}`,
    )
    const rows = detail.results ?? []
    return rows
      .filter((r): r is StrategyResultRow & { run_id: string; run_at: string } =>
        typeof r.run_id === 'string' && r.run_id.length > 0
        && typeof r.run_at === 'string' && r.run_at.length > 0,
      )
      .map<StrategyRun>(r => ({
        run_id: r.run_id,
        run_at: r.run_at,
        sharpe_ratio: r.sharpe ?? null,
        total_return_pct: r.return_pct ?? null,
        max_drawdown_pct: r.max_drawdown_pct ?? null,
        source: r.source ?? null,
      }))
  },

  getStrategyDetail: (strategyId: string): Promise<StrategyDetail> =>
    request<StrategyDetail>(`/strategies/${encodeURIComponent(strategyId)}`),

  runBacktest: (strategyId: string, symbol: string): Promise<RunBacktestResult> =>
    request<RunBacktestResult>('/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy_id: strategyId, symbol }),
    }),

  createJob: (params: CreateJobParams): Promise<JobSummary> =>
    request<JobSummary>('/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }),

  listJobs: (): Promise<JobSummary[]> => request<JobSummary[]>('/jobs'),

  getJob: (jobId: string): Promise<JobDetail> =>
    request<JobDetail>(`/jobs/${encodeURIComponent(jobId)}`),

  cancelJob: (jobId: string): Promise<JobSummary> =>
    request<JobSummary>(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' }),

  // AI 戦略開発（agent）バックエンド検出・ジョブ作成（vis Task 9）。
  // 観察・キャンセルは既存 /api/jobs 系（cancelJob / getJob / SSE）を共用する。
  getAgentBackends: (): Promise<AgentBackendsResponse> =>
    request<AgentBackendsResponse>('/agent/backends'),

  createAgentJob: (params: CreateAgentJobParams): Promise<JobSummary> =>
    request<JobSummary>('/agent/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }),

  saveStrategyParameters: (
    strategyId: string,
    parameters: Record<string, unknown>,
  ): Promise<SaveParametersResult> =>
    request<SaveParametersResult>(
      `/strategies/${encodeURIComponent(strategyId)}/parameters`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parameters }),
      },
    ),

  duplicateStrategy: (
    strategyId: string,
    newStrategyId: string,
  ): Promise<DuplicateStrategyResult> =>
    request<DuplicateStrategyResult>(
      `/strategies/${encodeURIComponent(strategyId)}/duplicate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_strategy_id: newStrategyId }),
      },
    ),

  listIdeas: (status?: string): Promise<IdeaItem[]> =>
    request<IdeaItem[]>(`/ideas${status ? `?status=${encodeURIComponent(status)}` : ''}`),

  getIdea: (ideaId: string): Promise<IdeaItem> =>
    request<IdeaItem>(`/ideas/${encodeURIComponent(ideaId)}`),

  listLive: (): Promise<LiveListItem[]> =>
    request<LiveListItem[]>('/live'),

  getLive: (strategyId: string, runId?: string): Promise<LiveDetailResponse> => {
    const qs = runId ? `?run_id=${encodeURIComponent(runId)}` : ''
    return request<LiveDetailResponse>(`/live/${encodeURIComponent(strategyId)}${qs}`)
  },

  // OHLC 時系列（#189 で backend に追加）。
  // backend の /api/historical/{symbol} を呼び lightweight-charts 互換の bars を取得する。
  getHistorical: (
    symbol: string,
    interval: string = '1d',
    range?: { start?: string; end?: string },
  ): Promise<HistoricalResponse> => {
    const params = new URLSearchParams({ interval })
    if (range?.start) params.set('start', range.start)
    if (range?.end) params.set('end', range.end)
    return request<HistoricalResponse>(
      `/historical/${encodeURIComponent(symbol)}?${params.toString()}`,
    )
  },

  // 孤児バックテスト結果（strategies.db に無い strategy_id の結果）の一覧・削除。
  // /maintenance 画面（vis#Task2）から利用する。
  listOrphanRuns: (): Promise<OrphanRunsResponse> =>
    request<OrphanRunsResponse>('/maintenance/orphan-runs'),

  // strategyIds が空の呼び出しは forge が全孤児を削除してしまうため、
  // backend が 400 で弾く（呼び出し側の hook でも重ねてガードする）。
  pruneOrphanRuns: (strategyIds: string[]): Promise<PruneOrphansResponse> =>
    request<PruneOrphansResponse>('/maintenance/orphan-runs', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy_ids: strategyIds }),
    }),
}

export { ApiError }
