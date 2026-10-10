# Comandos do dia a dia — NaicoTech Store

Guia rápido pra quando você abrir o VS Code e não lembrar o que rodar. Todos os caminhos assumem que a raiz do projeto é `C:\Programacao\naicotech-store`.

---

## 1. Rotina de abrir o projeto (todo dia)

**1.1. Confirma que o Docker Desktop está aberto**
Procura o ícone da baleia 🐳 na bandeja do sistema (perto do relógio). Se não estiver, abre pelo menu Iniciar e espera carregar.

**1.2. Sobe o banco de dados** (na pasta raiz do projeto)
```powershell
cd C:\Programacao\naicotech-store
docker compose up -d
```

**1.3. Confirma que o container está rodando**
```powershell
docker ps
```
Devem aparecer `naicotech-postgres` e `naicotech-mailpit` com status `Up`.

**1.4. Sobe o backend** (em outro terminal, ou `Ctrl+Shift+` `` ` `` pra abrir um novo)
```powershell
cd backend
npm run start:dev
```
Espera aparecer `Nest application successfully started` antes de testar qualquer rota.

**1.5. Faz login pra testar rotas protegidas** (num terceiro terminal)
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/auth/login" -Method Post -ContentType "application/json" -Body '{"email":"seu@email.com","password":"suaSenha"}' -SessionVariable s
```
⚠️ A sessão fica num cookie guardado na variável `$s` (`-WebSession $s` nas próximas chamadas). Ela só existe nesse terminal. O login aceita 5 tentativas por minuto por IP.

---

## 2. Comandos do Prisma (banco de dados)

| O que você quer fazer | Comando |
|---|---|
| Aplicar uma mudança que você fez no `schema.prisma` | `npx prisma migrate dev --name nome_da_mudanca` |
| Regenerar o client depois de mudar o schema (o migrate já faz isso sozinho, mas se der erro de tipo, roda de novo) | `npx prisma generate` |
| Ver os dados do banco numa interface visual no navegador | `npx prisma studio` |
| Testar se a conexão com o banco está ok (lê o banco, não muda nada) | `npx prisma db pull` |

Todos esses rodam **dentro da pasta `backend/`**.

---

## 3. Docker / banco de dados

| O que você quer fazer | Comando |
|---|---|
| Subir o banco | `docker compose up -d` (na raiz do projeto) |
| Parar o banco (mantém os dados) | `docker compose down` |
| Apagar o banco inteiro e recomeçar do zero | `docker compose down -v` seguido de `docker compose up -d` — **só use isso se não tiver dado importante, apaga tudo** |
| Ver se o container está rodando | `docker ps` |
| Entrar direto no banco via linha de comando | `docker exec -it naicotech-postgres psql -U naicotech -d naicotech_store` (sai com `\q`) |
| Ver a config real (senha, usuário) que o Docker está usando | `docker compose config` |

---

## 4. Testando rotas da API pelo PowerShell

**Em terminal novo, faz login de novo** (ver item 1.5).

**Registrar usuário:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/auth/register" -Method Post -ContentType "application/json" -Body '{"name":"Nome","email":"email@teste.com","password":"senha12345"}'
```

**Rota protegida (com a sessão):**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/auth/me" -Method Get -WebSession $s
```

**Corpo com acento (ç, ã, é, etc.) — sempre converte pra UTF-8 antes, senão corrompe:**
```powershell
$body = [System.Text.Encoding]::UTF8.GetBytes('{"name":"Categoria com Acentuação"}')
Invoke-RestMethod -Uri "http://localhost:3000/categories" -Method Post -ContentType "application/json; charset=utf-8" -Body $body -WebSession $s
```

---

## 5. Promover um usuário a ADMIN

Não existe rota pública pra isso (seria falha de segurança). Faz direto no banco:

```powershell
docker exec -it naicotech-postgres psql -U naicotech -d naicotech_store
```
Dentro do prompt:
```sql
UPDATE "User" SET role = 'ADMIN' WHERE email = 'email@aqui.com';
```
Sai com `\q`. O papel novo vale na hora, sem precisar logar de novo: o backend confere o papel no banco a cada requisição.

---

## 6. Quando algo não conecta

- **`docker compose up` dá erro de conexão com o daemon** → Docker Desktop não está aberto. Abre ele e espera carregar.
- **`Invoke-RestMethod` dá "Impossível conectar-se ao servidor remoto"** → o `npm run start:dev` não está rodando ou caiu. Confirma no terminal dele.
- **Erro 401 "Faça login para continuar"** → a variável `$s` está vazia (terminal novo) ou a sessão expirou (1 dia). Faz login de novo (item 1.5).
- **Erro 429 "Muitas tentativas"** → limite de tentativas por IP. Espera 1 minuto.
- **Erro de autenticação no Postgres mesmo com senha certa** → verifica se não tem outro Postgres rodando na sua máquina disputando a porta 5432 (`netstat -ano | findstr :5432`). Se tiver, o nosso container usa a porta `5433` (confirma no `docker-compose.yml`).

---

## 7. Verificar segurança das dependências

```powershell
npm audit
```
Roda dentro do `backend/`. Antes de rodar `npm audit fix --force`, sempre confirma o que ele vai instalar — já tivemos caso de quebrar a versão do Prisma configurada no projeto.

---

## 8. Frontend (React + Vite)

Com o backend rodando (item 1.4), em outro terminal:
```powershell
cd frontend
npm install   # só na primeira vez
npm run dev
```
Abre http://localhost:5173. O Vite redireciona `/api/*` para `http://localhost:3000`, então não precisa configurar CORS em dev.

| O que você quer fazer | Comando (dentro de `frontend/`) |
|---|---|
| Rodar em modo dev | `npm run dev` |
| Checar tipos + gerar build de produção | `npm run build` |
| Lint | `npm run lint` |

---

## 9. Testar pagamento (Mercado Pago, modo teste)

1. `backend\.env`: `MERCADOPAGO_ACCESS_TOKEN` (credenciais de teste da MESMA aplicação da Public Key) e `MERCADOPAGO_WEBHOOK_SECRET`. **Reinicie o backend** depois de editar o `.env` (o watch não recarrega o `.env`).
2. `frontend\.env`: `VITE_MP_PUBLIC_KEY`.
3. Túnel para o webhook: `ngrok http 3000`. No painel do Mercado Pago > Webhooks, URL `https://SEU-ENDERECO.ngrok-free.app/payments/webhook`, evento **Order (Mercado Pago)**. Se o endereço do ngrok mudar, atualize no painel.
4. Cartões de teste: Mastercard `5480 8328 0103 3311`, Visa `4235 6477 2802 5682` ou Elo débito `5067 7667 8388 8311`, CVV `123`, validade `11/30`, CPF `12345678909`.
   O **nome do titular** define o resultado: `APRO` = aprovado, `OTHE` = recusado, `CONT` = pendente.

---

## 10. E-mails em dev (Mailpit)

O `docker compose up -d` também sobe o **Mailpit**, que captura todos os e-mails que o backend envia (nada sai para a internet).
- Caixa de entrada: http://localhost:8025
- Contas novas precisam confirmar o e-mail antes de entrar: abra o e-mail no Mailpit, clique em **Validar minha conta** e depois em **Confirmar minha conta**.
- Para produção, troque `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` e `MAIL_FROM` no `backend\.env` pelos dados de um provedor SMTP (ex.: Brevo, Resend, Amazon SES) e ajuste `FRONTEND_URL`.

---

## 11. Testes automatizados

| O que | Comando | Onde |
|---|---|---|
| Testes do backend (API inteira: login, pedidos, pagamento, webhook, segurança) | `npm run test:e2e` | `backend/` |
| Testes do front (componentes, carrinho, telas de login/senha) | `npm test` | `frontend/` |

- O backend precisa do Docker rodando (`docker compose up -d`). Os testes usam um banco **separado**, `naicotech_store_test`, criado sozinho na primeira vez. Eles **apagam os dados desse banco** a cada teste, e se recusam a rodar em qualquer banco cujo nome não termine em `_test`.
- O Mercado Pago e o envio de e-mail são simulados: os testes não cobram nada nem mandam e-mail.
- Rode os dois antes de qualquer commit importante. Se algum falhar, a mensagem mostra qual regra quebrou.

## 12. Esqueci a senha (fluxo)

Tela de login → **Esqueci minha senha** → e-mail com link (vale 1 hora, uso único; em dev aparece no Mailpit) → nova senha. Ao salvar, todas as sessões abertas da conta são encerradas, chega um e-mail avisando da troca e a pessoa já entra.

---

## 13. Painel de admin (http://localhost:5173/admin)

1. Promova sua conta a ADMIN (seção 5). O link **Admin** aparece no topo do site.
2. No primeiro acesso, o painel pede para configurar a **verificação em duas etapas**: confirme a senha, escaneie o QR code com um app autenticador (Google Authenticator, Microsoft Authenticator, Authy...) e digite o código de 6 dígitos.
3. Guarde os **10 códigos de recuperação** (gerenciador de senhas ou papel). Eles só aparecem uma vez e servem para entrar se você perder o celular.
4. Nas próximas vezes, o painel pede o código do app. A sessão do painel dura **30 minutos**.

**Regras de segurança do painel**
- Sem a segunda etapa, nenhuma rota de admin funciona (nem pela API direta).
- 5 códigos errados bloqueiam o painel por 15 minutos e mandam um e-mail de alerta. Cada código só vale uma vez.
- Toda alteração (produto, categoria, status de pedido) e toda tentativa de acesso ficam no **Registro de atividades** (aba Segurança).
- Perdeu o celular: entre com um código de recuperação → aba Segurança → **Trocar de celular** → configure o novo.
- A chave `TOTP_ENCRYPTION_KEY` do `backend\.env` criptografa os segredos do autenticador. **Não perca nem troque**: sem ela, os admins precisam reconfigurar o autenticador (zere com `UPDATE "User" SET "totpSecretEnc" = NULL, "totpEnabledAt" = NULL WHERE email = '...';`).

---

## 14. Rodar o front como em produção

```powershell
cd frontend
npm run build
npm start          # http://localhost:8080 (PORT e API_URL configuráveis)
```
O `server.mjs` serve o build com a CSP enviada como header HTTP e um **nonce novo a cada página** (libera só o antifraude do Mercado Pago), além dos headers de segurança. Também encaminha `/api` para o backend. Atrás de HTTPS, use `HSTS=true`. A origem dele precisa estar no `FRONTEND_URL` ou no `CORS_ORIGINS` do backend.
