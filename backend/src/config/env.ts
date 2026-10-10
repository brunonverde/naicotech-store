// Valida o .env ao subir: melhor não iniciar do que rodar com segredo fraco ou ausente.
const PLACEHOLDERS = ['GERE_UM', 'TROQUE_POR', 'seu-access-token', 'chave-secreta', 'cole-o-token'];

function fail(message: string): never {
  throw new Error(`[config] ${message}`);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} não definido no backend/.env`);
  if (PLACEHOLDERS.some((p) => value.includes(p))) {
    fail(`${name} ainda está com o valor de exemplo do .env.example`);
  }
  return value;
}

export function validateEnv() {
  required('DATABASE_URL');

  const jwtSecret = required('JWT_SECRET');
  if (jwtSecret.length < 32) {
    fail('JWT_SECRET precisa de pelo menos 32 caracteres (veja o README para gerar um)');
  }

  required('MERCADOPAGO_ACCESS_TOKEN');
  required('MERCADOPAGO_WEBHOOK_SECRET');

  const totpKey = required('TOTP_ENCRYPTION_KEY');
  if (!/^[0-9a-f]{64}$/i.test(totpKey)) {
    fail('TOTP_ENCRYPTION_KEY precisa ter 64 caracteres hexadecimais (veja o .env.example)');
  }
  const addressKey = required('ADDRESS_ENCRYPTION_KEY');
  if (!/^[0-9a-f]{64}$/i.test(addressKey)) {
    fail('ADDRESS_ENCRYPTION_KEY precisa ter 64 caracteres hexadecimais (veja o .env.example)');
  }
  if (addressKey.toLowerCase() === totpKey.toLowerCase()) {
    fail('ADDRESS_ENCRYPTION_KEY precisa ser diferente da TOTP_ENCRYPTION_KEY');
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

  if (isProduction()) {
    if (!frontendUrl.startsWith('https://')) fail('Em produção, FRONTEND_URL precisa ser https');
    if (process.env.MERCADOPAGO_ACCESS_TOKEN?.startsWith('TEST-')) {
      fail('Em produção, use o access token de produção do Mercado Pago');
    }
    if (isMelhorEnvioSandbox()) {
      fail('Em produção, defina MELHOR_ENVIO_SANDBOX=false e use o token de produção do Melhor Envio');
    }
  }
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
