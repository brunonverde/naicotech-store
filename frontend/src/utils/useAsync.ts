import { useEffect, useState } from 'react'
import type { DependencyList } from 'react'

interface AsyncState<T> {
  data: T | null
  error: string | null
  loading: boolean
}

// Carrega dados ao montar (e quando deps mudam), ignorando respostas antigas.
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true })

  // deps vêm de quem chama o hook.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let active = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fn()
      .then((data) => active && setState({ data, error: null, loading: false }))
      .catch((err: Error) => active && setState({ data: null, error: err.message, loading: false }))
    return () => {
      active = false
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
