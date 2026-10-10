# NaicoTech Store

Loja virtual de hardware e acessórios. Backend em NestJS + TypeScript + Prisma + PostgreSQL, pagamentos via Mercado Pago (Orders API).

## Primeira execução (Windows / PowerShell)

1. Copie os exemplos e preencha os valores:
   ```powershell
   Copy-Item .env.example .env
   Copy-Item backend\.env.example backend\.env
   ```
   - Em `.env`: escolha uma senha forte para `POSTGRES_PASSWORD`.
   - Em `backend\.env`: use a MESMA senha em `DATABASE_URL`.
   - Gere o `JWT_SECRET`:
     ```powershell
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```
   - `MERCADOPAGO_ACCESS_TOKEN`: painel do Mercado Pago, credenciais de teste.
   - `MERCADOPAGO_WEBHOOK_SECRET`: ao configurar o webhook, copie a chave secreta (gere uma nova, a antiga estava no PC formatado).
2. Suba o banco (Docker Desktop aberto):
   ```powershell
   docker compose up -d
   ```
3. Instale e prepare o backend:
   ```powershell
   cd backend
   npm install
   npx prisma migrate dev --name init
   npx prisma generate
   npm run start:dev
   ```
4. Cadastre um usuário em `POST /auth/register` e promova a ADMIN (veja `COMANDOS.md`, seção 5).

Mais comandos do dia a dia: `COMANDOS.md`.

## Segurança

- Nunca suba `.env` para o GitHub (já está no `.gitignore`).
- Dados de cartão nunca passam pelo servidor: o front gera um token no Mercado Pago e a API só recebe o token.
