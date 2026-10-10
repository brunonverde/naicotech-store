import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { Client } from 'pg';
import { assertTestDatabase, testDatabaseUrl } from './test-env';

// Roda uma vez antes de todos os testes: cria o banco de testes (se preciso)
// e aplica as migrations nele.
export default async function globalSetup() {
  const url = testDatabaseUrl();
  assertTestDatabase(url);

  const target = new URL(url);
  const dbName = target.pathname.replace(/^\//, '');
  const admin = new URL(url);
  admin.pathname = '/postgres';

  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (!rowCount) {
      // Nome validado acima (termina em _test e vem do próprio .env); aspas para identificador.
      await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`);
    }
  } finally {
    await client.end();
  }

  execSync('npx prisma migrate deploy', {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
