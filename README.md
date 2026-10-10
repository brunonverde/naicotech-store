# NaicoTech Store

Loja virtual de hardware e acessórios. Frontend em React + Vite + TypeScript. Backend em NestJS + TypeScript + Prisma + PostgreSQL, pagamentos via Mercado Pago (Orders API) e frete via Melhor Envio (Correios, Jadlog e outras).

> **Projeto de portfólio.** A loja roda em modo de demonstração (`VITE_DEMO_MODE=true`): pagamentos e frete em sandbox, sem vendas reais.

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
   - `TOTP_ENCRYPTION_KEY` e `ADDRESS_ENCRYPTION_KEY`: duas chaves **diferentes**, cada uma gerada com
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - `MELHOR_ENVIO_TOKEN`: painel do Melhor Envio (sandbox) > Gerenciar > Tokens. `SHIPPING_ORIGIN_CEP` é o CEP de onde os pacotes saem; os dados `SHIPPING_SENDER_*` só são exigidos para gerar etiqueta.
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
5. Suba o frontend (React + Vite + TypeScript), em outro terminal:
   ```powershell
   cd frontend
   npm install
   npm run dev
   ```
   Abra http://localhost:5173. Em dev, o Vite redireciona `/api` para o backend na porta 3000.

Testes: `npm run test:e2e` em `backend/` e `npm test` em `frontend/` (detalhes no `COMANDOS.md`, seção 11).

Mais comandos do dia a dia: `COMANDOS.md`.

## Segurança

- Nunca suba `.env` para o GitHub (já está no `.gitignore`).
- O backend recusa subir com `.env` incompleto, com valor de exemplo ou com `JWT_SECRET` com menos de 32 caracteres.

**Contas e sessão**
- Senhas com bcrypt (12 rounds). Login exige e-mail confirmado (link de uso único, válido por 24h, guardado só como hash).
- Sessão em cookie `httpOnly` + `SameSite=Strict` (+ `Secure` em produção): o JavaScript da página não acessa o token.
- JWT HS256 com validade de 1 dia. Papel e status da conta são conferidos no banco a cada requisição; "Sair" invalida todas as sessões da conta.
- Cadastro, login, reenvio e "esqueci a senha" não revelam quais e-mails existem (mesma resposta e tempo constante).
- Recuperação de senha por link de uso único (1 hora, guardado como hash); trocar a senha encerra todas as sessões e avisa por e-mail.

**Ataques automatizados e navegador**
- Rate limit por IP: login 5/min, cadastro 3/min, reenvio 3/min, pagamento 5/min, geral 120/min.
- CSRF: além do SameSite, a API exige origem permitida e corpo JSON nas rotas que alteram dados.
- Headers de segurança (helmet), CORS com lista fechada, corpo limitado a 20 KB, validação estrita de todos os campos.
- Front: CSP com nonce por página (só scripts próprios e do Mercado Pago; testada com pagamento real no build de produção), headers de segurança no `server.mjs` e tela de erro no lugar de tela vazia.

**Painel de admin**
- Verificação em duas etapas (TOTP) obrigatória, com segredo criptografado no banco (AES-256-GCM), códigos de uso único e 10 códigos de recuperação guardados como hash.
- Sessão do painel separada da sessão da loja, válida por 30 min e invalidada por logout ou troca de senha.
- Bloqueio de 15 min após 5 códigos errados, com alerta por e-mail; registro de auditoria de todas as ações de admin.

**Pedidos e pagamentos**
- Dados de cartão nunca passam pelo servidor: o front gera um token no Mercado Pago e a API só recebe o token.
- Preço e total vêm sempre do banco. Pedido não pago expira em 30 min e devolve o estoque; no máximo 3 pedidos pendentes por pessoa.
- Trava contra cobrança dupla e chave de idempotência por tentativa.
- Webhook: assinatura validada (com janela anti-replay), status consultado direto na API do Mercado Pago e valor pago conferido com o total do pedido.

**Frete e endereços (LGPD)**
- Frete sempre recotado no servidor ao criar o pedido; o preço mostrado no navegador não vale. Cotações em cache de 10 min (não esgota a API).
- Endereço, CPF e telefone criptografados (AES-256-GCM, chave própria) e amarrados ao dono; a API só devolve versões mascaradas.
- Endereço salvo só com consentimento; o do pedido é apagado 90 dias após a entrega. Admin vê o completo só sob demanda, com auditoria.
- Sem CNPJ, o envio vai com declaração de conteúdo e seguro limitado a R$ 1.000; `SHIPPING_COMMERCIAL=true` ativa o modo com NF-e.

**Direitos do titular**
- Em "Minha conta" o cliente baixa todos os seus dados (JSON) e exclui a conta, sempre confirmando a senha.
- A exclusão apaga dados pessoais, endereços e avaliações; pedidos ficam anônimos (obrigação fiscal).
- Cadastro registra o aceite dos Termos e da Política de Privacidade. Páginas legais em `/privacidade`, `/termos` e `/trocas`.

Detalhes, plano de resposta a incidentes e rotação de chaves: [`docs/SEGURANCA.md`](docs/SEGURANCA.md).

**Antes de ir para produção**
- HTTPS obrigatório, `NODE_ENV=production`, `TRUST_PROXY` conforme a hospedagem e credenciais de produção do Mercado Pago.
- Servir o front com `npm start` (`server.mjs`) ou replicar os mesmos headers no servidor escolhido.
- Banco com senha forte e sem porta exposta na internet; backups automáticos.
