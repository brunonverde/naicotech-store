// Content Security Policy do front, usada pelo build (meta tag) e pelo servidor
// de produção (header HTTP). Só deixa a página carregar scripts, iframes e
// conexões do próprio site e do Mercado Pago.

export const NONCE_PLACEHOLDER = '__CSP_NONCE__'

const MP = [
  'https://*.mercadopago.com',
  'https://*.mercadolibre.com',
  'https://*.mercadolivre.com',
  'https://*.mlstatic.com',
].join(' ')

/**
 * @param {string} nonce Valor aleatório por resposta. Libera só o script inline
 *   de antifraude (device fingerprint) que o SDK do Mercado Pago injeta com esse nonce.
 * @param {{ header?: boolean }} options header=true inclui diretivas que só valem via header HTTP.
 */
export function buildCsp(nonce, { header = false } = {}) {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' ${MP}`,
    `frame-src ${MP}`,
    `connect-src 'self' ${MP}`,
    "img-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline'",
    `font-src 'self' data: ${MP}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ]
  // Impede que outro site carregue a loja num iframe (clickjacking).
  if (header) directives.push("frame-ancestors 'none'")
  return directives.join('; ')
}
