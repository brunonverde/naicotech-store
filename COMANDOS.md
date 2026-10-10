# Comandos do dia a dia — NaicoTech Store

Guia rápido pra quando você abrir o VS Code e não lembrar o que rodar. Todos os caminhos assumem que a raiz do projeto é `C:\Programacao\naicotech-store\naicotech-store`.

---

## 1. Rotina de abrir o projeto (todo dia)

**1.1. Confirma que o Docker Desktop está aberto**
Procura o ícone da baleia 🐳 na bandeja do sistema (perto do relógio). Se não estiver, abre pelo menu Iniciar e espera carregar.

**1.2. Sobe o banco de dados** (na pasta raiz do projeto)
```powershell
cd C:\Programacao\naicotech-store\naicotech-store
docker compose up -d
```

**1.3. Confirma que o container está rodando**
```powershell
docker ps
```
Deve aparecer `naicotech-postgres` com status `Up`.

**1.4. Sobe o backend** (em outro terminal, ou `Ctrl+Shift+` `` ` `` pra abrir um novo)
```powershell
cd backend
npm run start:dev
```
Espera aparecer `Nest application successfully started` antes de testar qualquer rota.

**1.5. Gera um token de login pra testar rotas protegidas** (num terceiro terminal)
```powershell
$login = Invoke-RestMethod -Uri "http://localhost:3000/auth/login" -Method Post -ContentType "application/json" -Body '{"email":"bruno@teste.com","password":"senhaSegura123"}'
$token = $login.accessToken
```
⚠️ Essa variável `$token` só existe nesse terminal — se abrir um terminal novo, precisa gerar de novo.

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

**Sempre gera o token de novo em terminal novo** (ver item 1.5).

**Registrar usuário:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/auth/register" -Method Post -ContentType "application/json" -Body '{"name":"Nome","email":"email@teste.com","password":"senha12345"}'
```

**Rota protegida (com token):**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/auth/me" -Method Get -Headers @{ Authorization = "Bearer $token" }
```

**Corpo com acento (ç, ã, é, etc.) — sempre converte pra UTF-8 antes, senão corrompe:**
```powershell
$body = [System.Text.Encoding]::UTF8.GetBytes('{"name":"Categoria com Acentuação"}')
Invoke-RestMethod -Uri "http://localhost:3000/categories" -Method Post -ContentType "application/json; charset=utf-8" -Body $body -Headers @{ Authorization = "Bearer $token" }
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
Sai com `\q`. Depois **faz login de novo** — o token antigo continua com o papel (`role`) antigo gravado nele até você gerar um novo.

---

## 6. Quando algo não conecta

- **`docker compose up` dá erro de conexão com o daemon** → Docker Desktop não está aberto. Abre ele e espera carregar.
- **`Invoke-RestMethod` dá "Impossível conectar-se ao servidor remoto"** → o `npm run start:dev` não está rodando ou caiu. Confirma no terminal dele.
- **Erro 401 "Token não fornecido"** → a variável `$token` está vazia (terminal novo). Gera login de novo (item 1.5).
- **Erro de autenticação no Postgres mesmo com senha certa** → verifica se não tem outro Postgres rodando na sua máquina disputando a porta 5432 (`netstat -ano | findstr :5432`). Se tiver, o nosso container usa a porta `5433` (confirma no `docker-compose.yml`).

---

## 7. Verificar segurança das dependências

```powershell
npm audit
```
Roda dentro do `backend/`. Antes de rodar `npm audit fix --force`, sempre confirma o que ele vai instalar — já tivemos caso de quebrar a versão do Prisma configurada no projeto.
