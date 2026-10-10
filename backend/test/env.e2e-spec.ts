import { randomBytes } from 'node:crypto';
import { testSecret, validateEnv } from '../src/config/env';

// Validação do .env na subida da API (main.ts). Sem banco: só mexe em process.env.
describe('validateEnv', () => {
  const original = { ...process.env };
  const hex = () => randomBytes(32).toString('hex');

  // .env de produção válido, com segredos aleatórios.
  function productionEnv(overrides: Record<string, string | undefined> = {}) {
    process.env = {
      ...original,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      JWT_SECRET: randomBytes(48).toString('base64url'),
      MERCADOPAGO_ACCESS_TOKEN: 'APP_USR-123',
      MERCADOPAGO_WEBHOOK_SECRET: hex(),
      TOTP_ENCRYPTION_KEY: hex(),
      ADDRESS_ENCRYPTION_KEY: hex(),
      IP_ENCRYPTION_KEY: hex(),
      MELHOR_ENVIO_TOKEN: 'token-real',
      MELHOR_ENVIO_SANDBOX: 'false',
      SHIPPING_ORIGIN_CEP: '20040020',
      FRONTEND_URL: 'https://loja.exemplo.com',
      SMTP_HOST: 'smtp.exemplo.com',
      DEMO_MODE: undefined,
      PROXY_SECRET: undefined,
    };
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  afterEach(() => {
    process.env = { ...original };
  });

  it('aceita um .env de produção com segredos aleatórios', () => {
    productionEnv();
    expect(() => validateEnv()).not.toThrow();
  });

  it('recusa os segredos dos testes fora do ambiente de teste', () => {
    for (const name of ['JWT_SECRET', 'TOTP_ENCRYPTION_KEY', 'ADDRESS_ENCRYPTION_KEY', 'IP_ENCRYPTION_KEY', 'MERCADOPAGO_WEBHOOK_SECRET']) {
      productionEnv({ [name]: testSecret(name) });
      expect(() => validateEnv()).toThrow(/valor de teste/);
    }
  });

  it('recusa os segredos de teste antigos, que estão no histórico do git', () => {
    productionEnv({ JWT_SECRET: 'segredo-de-teste-com-mais-de-32-caracteres-0123456789' });
    expect(() => validateEnv()).toThrow(/valor de teste/);
    productionEnv({ TOTP_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4) });
    expect(() => validateEnv()).toThrow(/valor de teste/);
  });

  it('recusa chaves repetitivas', () => {
    productionEnv({ ADDRESS_ENCRYPTION_KEY: '0'.repeat(64) });
    expect(() => validateEnv()).toThrow(/fraco/);
    productionEnv({ JWT_SECRET: 'ab'.repeat(20) });
    expect(() => validateEnv()).toThrow(/fraco/);
  });

  it('em produção exige SMTP_HOST, e no modo demo exige PROXY_SECRET', () => {
    productionEnv({ SMTP_HOST: undefined });
    expect(() => validateEnv()).toThrow(/SMTP_HOST/);

    productionEnv({ DEMO_MODE: 'true', MELHOR_ENVIO_SANDBOX: 'true', MERCADOPAGO_ACCESS_TOKEN: 'TEST-123' });
    expect(() => validateEnv()).toThrow(/PROXY_SECRET/);
    productionEnv({ DEMO_MODE: 'true', MELHOR_ENVIO_SANDBOX: 'true', PROXY_SECRET: randomBytes(32).toString('hex') });
    expect(() => validateEnv()).not.toThrow();
  });
});
