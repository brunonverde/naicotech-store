import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import { buildCsp, NONCE_PLACEHOLDER } from './csp.mjs'

// CSP do build de produção (detalhes em csp.mjs). O servidor de produção
// (server.mjs) troca o NONCE_PLACEHOLDER por um valor aleatório a cada página e
// também envia a CSP como header HTTP. Em dev não é aplicada, porque o Vite
// injeta scripts inline para o HMR.
function contentSecurityPolicy(): Plugin {
  return {
    name: 'naicotech-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCsp(NONCE_PLACEHOLDER) },
        injectTo: 'head-prepend',
      },
      // Lido pelo front para repassar o nonce ao SDK do Mercado Pago.
      { tag: 'meta', attrs: { name: 'csp-nonce', content: NONCE_PLACEHOLDER }, injectTo: 'head' },
      { tag: 'meta', attrs: { name: 'referrer', content: 'strict-origin-when-cross-origin' }, injectTo: 'head' },
    ],
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
  build: { sourcemap: false },
  server: {
    // Em dev, /api/* vai para o backend Nest sem precisar de CORS.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
