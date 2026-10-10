import { createHash } from 'node:crypto';

// Valida o .env ao subir: melhor não iniciar do que rodar com segredo fraco ou ausente.
const PLACEHOLDERS = ['GERE_UM', 'TROQUE_POR', 'seu-access-token', 'chave-secreta', 'cole-o-token'];

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Segredo usado só pelos testes automatizados (backend/test/setup-env.ts). É derivado
 * de um rótulo público, então qualquer um recalcula: fora dos testes, é recusado.
 */
export function testSecret(name: string): string {
  return sha256(`naicotech-test-only:${name}`);
}

// Segredos de teste de versões antigas, que ficaram públicos no histórico do git.
// Guardados só como hash, para o valor não aparecer de novo no código.
const LEGACY_TEST_SECRET_HASHES = new Set([
  '729d099f7d572d488d2b472a768f81b8ad0a1045d380dce2baee6794e8400451',
  '51d3bc3c18337885b201ecf800d4551e49743ca40a878a7376cc4d3b6a48f7ec',
  'a8ae6e6ee929abea3afcfc5258c8ccd6f85273e0d4626d26c7279f3250f77c8e',
  '7b9d07f2404b102b3c62fede026097c5ab81668f18414abd8ea560cecb008006',
  '2a8abfa8cb9906290437854193ca6bca41d4d4e26d1d454bd66a35158095e737',
  'a204111fdd596c5251b003b32d8a2f1f6a8dee22b441bd1863f2f579b25322f0',
]);

// Um segredo aleatório de verdade usa muitos símbolos diferentes; "aaaa…" ou "0000…" não.
const MIN_DISTINCT_CHARS = 12;

function fail(message: string): never {
  throw new Error(`[config] ${message}`);
}

function assertNotPublic(name: string, value: string) {
  if (process.env.NODE_ENV === 'test') return;
  if (value === testSecret(name) || LEGACY_TEST_SECRET_HASHES.has(sha256(value))) {
    fail(`${name} está com um valor de teste, que é público. Gere um novo (veja o .env.example)`);
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} não definido no backend/.env`);
  if (PLACEHOLDERS.some((p) => value.includes(p))) {
    fail(`${name} ainda está com o valor de exemplo do .env.example`);
  }
  assertNotPublic(name, value);
  return value;
}

/** Segredo nosso (não de terceiros): tamanho mínimo e sem padrão óbvio. */
function strongSecret(name: string, minLength: number): string {
  const value = required(name);
  if (value.length < minLength) fail(`${name} precisa de pelo menos ${minLength} caracteres (veja o .env.example)`);
  if (new Set(value).size < MIN_DISTINCT_CHARS) fail(`${name} parece fraco (repetitivo). Gere um aleatório`);
  return value;
}

function hexKey(name: string): string {
  const value = strongSecret(name, 64);
  if (!/^[0-9a-f]{64}$/i.test(value)) {
    fail(`${name} precisa ter 64 caracteres hexadecimais (veja o .env.example)`);
  }
  return value;
}

export function validateEnv() {
  required('DATABASE_URL');

  strongSecret('JWT_SECRET', 32);

  required('MERCADOPAGO_ACCESS_TOKEN');
  required('MERCADOPAGO_WEBHOOK_SECRET');

  const totpKey = hexKey('TOTP_ENCRYPTION_KEY');
  const addressKey = hexKey('ADDRESS_ENCRYPTION_KEY');
  const ipKey = hexKey('IP_ENCRYPTION_KEY');
  // Uma chave por finalidade: vazar uma não abre os dados das outras.
  if (new Set([totpKey, addressKey, ipKey].map((k) => k.toLowerCase())).size !== 3) {
    fail('TOTP_ENCRYPTION_KEY, ADDRESS_ENCRYPTION_KEY e IP_ENCRYPTION_KEY precisam ser diferentes');
  }

  required('MELHOR_ENVIO_TOKEN');
  if (!/^\d{8}$/.test(required('SHIPPING_ORIGIN_CEP').replace('-', ''))) {
    fail('SHIPPING_ORIGIN_CEP precisa ser um CEP com 8 dígitos');
  }

  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  try {
    new URL(frontendUrl);
  } catch {
    fail('FRONTEND_URL inválida');
  }

  if (process.env.PROXY_SECRET !== undefined) strongSecret('PROXY_SECRET', 32);

  if (isProduction()) {
    if (!frontendUrl.startsWith('https://')) fail('Em produção, FRONTEND_URL precisa ser https');
    // Sem SMTP, os e-mails de confirmação e de senha iriam para localhost:1025 e se perderiam.
    if (!process.env.SMTP_HOST?.trim()) fail('Em produção, defina SMTP_HOST (servidor de e-mail real)');
    if (isDemoMode()) {
      // Demonstração pública (portfólio): roda como produção (HTTPS, cookie Secure),
      // mas obrigatoriamente com pagamento e frete de teste. Nada é cobrado de verdade.
      if (!isMelhorEnvioSandbox()) fail('DEMO_MODE exige MELHOR_ENVIO_SANDBOX=true');
      // A demo fica atrás do proxy do Vercel: sem o segredo, a API aceitaria acesso direto.
      if (!process.env.PROXY_SECRET) fail('DEMO_MODE exige PROXY_SECRET (o mesmo configurado no Vercel)');
    } else {
      if (process.env.MERCADOPAGO_ACCESS_TOKEN?.startsWith('TEST-')) {
        fail('Em produção, use o access token de produção do Mercado Pago');
      }
      if (isMelhorEnvioSandbox()) {
        fail('Em produção, defina MELHOR_ENVIO_SANDBOX=false e use o token de produção do Melhor Envio');
      }
    }
  }
}

/** Demonstração pública do portfólio: produção com credenciais de teste. */
export function isDemoMode() {
  return process.env.DEMO_MODE === 'true';
}

/**
 * Envio comercial = loja com CNPJ, cada pacote com nota fiscal (NF-e).
 * Sem isso (padrão), o pacote vai com declaração de conteúdo e o Melhor Envio
 * limita o seguro a R$ 1.000.
 */
export function isCommercialShipping() {
  return process.env.SHIPPING_COMMERCIAL === 'true';
}

export const NON_COMMERCIAL_INSURANCE_CAP = 1000;

// Sandbox por padrão: só usa o Melhor Envio de verdade (com cobrança) se pedir explicitamente.
export function isMelhorEnvioSandbox() {
  return process.env.MELHOR_ENVIO_SANDBOX !== 'false';
}

export function isProduction() {
  return process.env.NODE_ENV === 'production';
}

// Origens que podem chamar a API com cookie de sessão.
export function allowedOrigins(): string[] {
  const extra = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return [new URL(process.env.FRONTEND_URL ?? 'http://localhost:5173').origin, ...extra];
}
