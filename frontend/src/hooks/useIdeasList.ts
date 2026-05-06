import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import type { IdeaItem } from '../api/types'

export interface IdeasListState {
  all: IdeaItem[]
  filtered: IdeaItem[]
  loading: boolean
  error: string | null
  statusFilter: string
  setStatusFilter: (s: string) => void
  tagFilter: string
  setTagFilter: (t: string) => void
  allTags: string[]
}

export function useIdeasList(): IdeasListState {
  const [searchParams, setSearchParams] = useSearchParams()
  const [all, setAll] = useState<IdeaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const statusFilter = searchParams.get('status') ?? ''
  const tagFilter = searchParams.get('tag') ?? ''

  useEffect(() => {
    let cancelled = false
    api.listIdeas()
      .then(data => {
        if (cancelled) return
        setAll(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const idea of all) {
      for (const tag of idea.tags ?? []) set.add(tag)
    }
    return [...set].sort()
  }, [all])

  const filtered = useMemo(() => {
    return all.filter(idea => {
      if (statusFilter && idea.status !== statusFilter) return false
      if (tagFilter && !(idea.tags ?? []).includes(tagFilter)) return false
      return true
    })
  }, [all, statusFilter, tagFilter])

  const setStatusFilter = (s: string): void => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (s) next.set('status', s)
      else next.delete('status')
      return next
    }, { replace: true })
  }

  const setTagFilter = (t: string): void => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (t) next.set('tag', t)
      else next.delete('tag')
      return next
    }, { replace: true })
  }

  return { all, filtered, loading, error, statusFilter, setStatusFilter, tagFilter, setTagFilter, allTags }
}
