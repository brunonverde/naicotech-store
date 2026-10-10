// Servidor de produção do front: serve o build (dist/), aplica a CSP com nonce
// novo a cada página e encaminha /api para o backend.
// Uso: npm run build && npm start   (variáveis: PORT, API_URL, HSTS)
import { randomBytes } from 'node:crypto'
import { createReadStream, readFileSync, statSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCsp, NONCE_PLACEHOLDER } from './csp.mjs'

const PORT = Number(process.env.PORT ?? 8080)
const API_URL = new URL(process.env.API_URL ?? 'http://localhost:3000')
const HSTS = process.env.HSTS === 'true' // ative quando estiver atrás de HTTPS
const DIST = resolve(fileURLToPath(new URL('.', import.meta.url)), 'dist')
const INDEX_TEMPLATE = readFileSync(join(DIST, 'index.html'), 'utf8')

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
}

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self)')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  if (HSTS) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
}

function sendIndex(res) {
  // Nonce novo por resposta: um script injetado não tem como adivinhar.
  const nonce = randomBytes(16).toString('base64')
  res.setHeader('Content-Security-Policy', buildCsp(nonce, { header: true }))
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', TYPES['.html'])
  res.end(INDEX_TEMPLATE.replaceAll(NONCE_PLACEHOLDER, nonce))
}

function serveStatic(req, res) {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  } catch {
    res.statusCode = 400
    return res.end()
  }
  // Bloqueia "../" e afins: o arquivo precisa estar dentro de dist/.
  const filePath = resolve(DIST, '.' + normalize(pathname))
  if (filePath !== DIST && !filePath.startsWith(DIST + sep)) {
    res.statusCode = 403
    return res.end()
  }

  let stats
  try {
    stats = statSync(filePath)
  } catch {
    stats = null
  }
  if (!stats?.isFile() || filePath.endsWith('index.html')) {
    // Rota do React Router (ex.: /pedidos/123) ou arquivo inexistente sem extensão.
    if (extname(pathname)) {
      res.statusCode = 404
      return res.end('Not found')
    }
    return sendIndex(res)
  }

  res.setHeader('Content-Type', TYPES[extname(filePath)] ?? 'application/octet-stream')
  res.setHeader('Content-Length', stats.size)
  // Arquivos do build têm hash no nome: podem ficar em cache "para sempre".
  if (pathname.startsWith('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  createReadStream(filePath).pipe(res)
}

function proxyApi(req, res) {
  const target = new URL(req.url.replace(/^\/api/, '') || '/', API_URL)
  const headers = { ...req.headers, host: API_URL.host }
  // Sobrescreve (não acrescenta) para o cliente não forjar o próprio IP no rate limit.
  headers['x-forwarded-for'] = req.socket.remoteAddress ?? ''
  headers['x-forwarded-proto'] = HSTS ? 'https' : 'http'

  const send = target.protocol === 'https:' ? httpsRequest : httpRequest
  const upstream = send(target, { method: req.method, headers }, (apiRes) => {
    res.writeHead(apiRes.statusCode ?? 502, apiRes.headers)
    apiRes.pipe(res)
  })
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ statusCode: 502, message: 'API indisponível' }))
  })
  req.pipe(upstream)
}

createServer((req, res) => {
  securityHeaders(res)
  if (req.url === '/api' || req.url?.startsWith('/api/')) return proxyApi(req, res)
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    return res.end()
  }
  serveStatic(req, res)
}).listen(PORT, () => {
  console.log(`NaicoTech front em http://localhost:${PORT} (API: ${API_URL.origin})`)
})
