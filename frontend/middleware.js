// Middleware do Vercel: faz no deploy o mesmo que o server.mjs faz localmente.
// - Páginas: devolve o index.html com um nonce novo na CSP a cada acesso.
// - /api/*: encaminha para o backend (Render) com o segredo do proxy e o IP real do visitante.
// Variáveis no Vercel (não são VITE_, então nunca vão para o navegador): API_URL, PROXY_SECRET.
import { buildCsp, NONCE_PLACEHOLDER } from './csp.mjs'

export const config = {
  // Tudo, menos arquivos do build (têm ponto no nome, ex.: /assets/index-abc.js).
  matcher: ['/((?!assets/|[^/]*\\.[^/]*$).*)', '/api/:path*'],
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(self)',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
}

// Headers do navegador que não devem ir para o backend (o proxy define os seus).
const DROP_REQUEST_HEADERS = ['host', 'x-proxy-secret', 'x-client-ip', 'x-forwarded-for', 'x-forwarded-host', 'connection']

function newNonce() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

async function proxyApi(request) {
  const apiUrl = process.env.API_URL
  const secret = process.env.PROXY_SECRET
  if (!apiUrl || !secret) {
    return Response.json({ statusCode: 503, message: 'API não configurada' }, { status: 503 })
  }
  const url = new URL(request.url)
  const target = new URL(url.pathname.replace(/^\/api/, '') || '/', apiUrl)
  target.search = url.search

  const headers = new Headers(request.headers)
  for (const name of DROP_REQUEST_HEADERS) headers.delete(name)
  headers.set('x-proxy-secret', secret)
  // O Vercel define x-real-ip com o IP de quem acessou; o navegador não consegue forjar.
  const clientIp = request.headers.get('x-real-ip')
  if (clientIp) headers.set('x-client-ip', clientIp)
  // Sem compressão no trecho Vercel → API, para repassar o corpo como veio.
  headers.set('accept-encoding', 'identity')

  let upstream
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
      redirect: 'manual',
    })
  } catch {
    // Render grátis "dorme": o primeiro acesso pode falhar enquanto ele acorda.
    return Response.json({ statusCode: 502, message: 'API indisponível. Tente de novo em alguns segundos.' }, { status: 502 })
  }
  const responseHeaders = new Headers(upstream.headers)
  responseHeaders.delete('content-encoding')
  responseHeaders.delete('content-length')
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
}

async function sendIndex(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 })
  const page = await fetch(new URL('/index.html', request.url))
  const nonce = newNonce()
  const html = (await page.text()).replaceAll(NONCE_PLACEHOLDER, nonce)
  return new Response(html, {
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': buildCsp(nonce, { header: true }),
      'Cache-Control': 'no-store',
    },
  })
}

export default function middleware(request) {
  const { pathname } = new URL(request.url)
  if (pathname === '/api' || pathname.startsWith('/api/')) return proxyApi(request)
  return sendIndex(request)
}
