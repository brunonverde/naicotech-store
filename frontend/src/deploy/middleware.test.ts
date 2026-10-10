// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import middleware from '../../middleware.js'

const SITE = 'https://naicotech.vercel.app'
const INDEX = '<meta name="csp-nonce" content="__CSP_NONCE__"><div id="root"></div>'

describe('middleware do Vercel', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env.API_URL = 'https://naicotech-api.onrender.com'
    process.env.PROXY_SECRET = 'segredo-do-proxy-com-mais-de-32-caracteres'
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/index.html')) return new Response(INDEX)
      return new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json', 'content-encoding': 'gzip', 'set-cookie': 'naicotech_session=abc; HttpOnly' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.API_URL
    delete process.env.PROXY_SECRET
  })

  it('páginas: nonce novo a cada acesso, na CSP e no HTML', async () => {
    const first = await middleware(new Request(`${SITE}/pedidos/123`))
    const second = await middleware(new Request(`${SITE}/pedidos/123`))
    const nonce = /'nonce-([^']+)'/.exec(first.headers.get('content-security-policy') ?? '')?.[1]

    expect(nonce).toBeTruthy()
    expect(await first.text()).toContain(`content="${nonce}"`)
    expect(second.headers.get('content-security-policy')).not.toContain(nonce)
    expect(first.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(first.headers.get('x-frame-options')).toBe('DENY')
    expect(first.headers.get('cache-control')).toBe('no-store')
  })

  it('/api: repassa para o backend com o segredo e o IP real, ignorando o que o navegador forjar', async () => {
    const res = await middleware(
      new Request(`${SITE}/api/orders?x=1`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: SITE,
          'x-real-ip': '203.0.113.7',
          'x-client-ip': '1.2.3.4',
          'x-proxy-secret': 'chute',
          'x-forwarded-for': '9.9.9.9',
        },
        body: '{"items":[]}',
      }),
    )

    const [target, init] = fetchMock.mock.calls[0] as [URL, RequestInit & { headers: Headers }]
    expect(String(target)).toBe('https://naicotech-api.onrender.com/orders?x=1')
    expect(init.method).toBe('POST')
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"items":[]}')
    expect(init.headers.get('x-proxy-secret')).toBe(process.env.PROXY_SECRET)
    expect(init.headers.get('x-client-ip')).toBe('203.0.113.7')
    expect(init.headers.get('x-forwarded-for')).toBeNull()
    expect(init.headers.get('origin')).toBe(SITE)

    // Cookie de sessão volta para o navegador; o corpo já vem descompactado.
    expect(res.headers.get('set-cookie')).toContain('naicotech_session=abc')
    expect(res.headers.get('content-encoding')).toBeNull()
    expect(await res.json()).toEqual({ ok: true })
  })

  it('/api sem configuração responde 503 em vez de vazar para outro lugar', async () => {
    delete process.env.API_URL
    const res = await middleware(new Request(`${SITE}/api/products`))
    expect(res.status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
