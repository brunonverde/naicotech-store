import { vi } from 'vitest'

type Route = { status?: number; body?: unknown }

// Substitui o fetch global: cada chamada responde conforme "MÉTODO /caminho".
export function mockFetch(routes: Record<string, Route | (() => Route)>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const key = `${init?.method ?? 'GET'} ${url.pathname.replace(/^\/api/, '')}`
    const route = routes[key]
    if (!route) throw new Error(`fetch não esperado: ${key}`)
    const { status = 200, body = {} } = typeof route === 'function' ? route() : route
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
