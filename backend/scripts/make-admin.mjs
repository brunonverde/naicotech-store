// Promove uma conta já cadastrada (e com e-mail confirmado) a administrador.
// Uso: npm run make-admin -- email@exemplo.com
// No primeiro acesso ao /admin, o painel obriga a configurar a verificação em duas etapas.
import { existsSync } from 'node:fs';
import pg from 'pg';

if (existsSync('.env')) process.loadEnvFile('.env');
const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Uso: npm run make-admin -- email@exemplo.com');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const { rowCount } = await client.query(
    `UPDATE "User" SET role = 'ADMIN' WHERE email = $1 AND "emailVerifiedAt" IS NOT NULL AND "deletedAt" IS NULL`,
    [email],
  );
  if (!rowCount) {
    console.error(`Nenhuma conta ativa e com e-mail confirmado para ${email}. Cadastre e confirme o e-mail primeiro.`);
    process.exitCode = 1;
  } else {
    console.log(`${email} agora é ADMIN. Entre no site e acesse /admin para configurar a verificação em duas etapas.`);
  }
} finally {
  await client.end();
}
