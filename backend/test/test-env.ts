import { config } from 'dotenv';
import { join } from 'node:path';

export const TEST_DB_SUFFIX = '_test';

// Deriva a URL do banco de testes a partir do DATABASE_URL do backend/.env,
// trocando o nome do banco (naicotech_store -> naicotech_store_test).
export function testDatabaseUrl(): string {
  config({ path: join(__dirname, '..', '.env'), quiet: true });
  const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL não definido no backend/.env');
  const url = new URL(base);
  const dbName = url.pathname.replace(/^\//, '');
  if (!dbName.endsWith(TEST_DB_SUFFIX)) url.pathname = `/${dbName}${TEST_DB_SUFFIX}`;
  return url.toString();
}

// Trava de segurança: os testes apagam dados. Nunca rodar fora do banco *_test.
export function assertTestDatabase(databaseUrl: string | undefined) {
  const name = databaseUrl ? new URL(databaseUrl).pathname.replace(/^\//, '') : '';
  if (!name.endsWith(TEST_DB_SUFFIX)) {
    throw new Error(`Recusado: os testes só rodam em banco terminado em "${TEST_DB_SUFFIX}" (atual: "${name}")`);
  }
}
