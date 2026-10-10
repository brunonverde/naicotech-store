import { assertTestDatabase, testDatabaseUrl } from './test-env';

// Roda antes de cada arquivo de teste, antes de importar o app.
process.env.DATABASE_URL = testDatabaseUrl();
assertTestDatabase(process.env.DATABASE_URL);

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres-0123456789';
process.env.MERCADOPAGO_ACCESS_TOKEN = 'TEST-token-falso-dos-testes';
process.env.MERCADOPAGO_WEBHOOK_SECRET = 'segredo-webhook-dos-testes';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.TOTP_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
delete process.env.CORS_ORIGINS;
delete process.env.TRUST_PROXY;
process.env.ADDRESS_ENCRYPTION_KEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
process.env.MELHOR_ENVIO_TOKEN = 'token-falso-dos-testes';
process.env.MELHOR_ENVIO_SANDBOX = 'true';
process.env.SHIPPING_ORIGIN_CEP = '20040020';
process.env.SHIPPING_SENDER_NAME = 'Loja Teste';
process.env.SHIPPING_SENDER_PHONE = '21999999999';
process.env.SHIPPING_SENDER_EMAIL = 'loja@teste.com';
process.env.SHIPPING_SENDER_DOCUMENT = '52998224725';
process.env.SHIPPING_SENDER_STREET = 'Rua Teste';
process.env.SHIPPING_SENDER_NUMBER = '1';
process.env.SHIPPING_SENDER_DISTRICT = 'Centro';
process.env.SHIPPING_SENDER_CITY = 'Rio de Janeiro';
process.env.SHIPPING_SENDER_STATE = 'RJ';
delete process.env.SHIPPING_SERVICES;
delete process.env.SHIPPING_AGENCIES;
delete process.env.SHIPPING_COMMERCIAL;
process.env.IP_ENCRYPTION_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
