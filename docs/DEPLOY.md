# Demo online (portfólio)

Frontend no **Vercel**, backend no **Render** e banco no **Neon**, todos no plano grátis.
Pagamento e frete continuam em **sandbox**: nada é cobrado e nenhum pacote é enviado.

```
Visitante ──► Vercel (frontend + middleware) ──/api──► Render (NestJS) ──► Neon (PostgreSQL)
                 │  CSP com nonce por página          só aceita chamadas com o PROXY_SECRET
                 └─ envia o IP real do visitante
```

> **Nunca use credenciais reais aqui.** Use só as de teste do Mercado Pago e o sandbox do Melhor Envio, e chaves **novas**, diferentes das do seu computador.

## 0. Gere as chaves (uma vez)

No PowerShell, rode e guarde a saída num lugar seguro (gerenciador de senhas):

```powershell
node -e "const r=()=>require('crypto').randomBytes(32).toString('hex');console.log('PROXY_SECRET='+r());console.log('TOTP_ENCRYPTION_KEY='+r());console.log('ADDRESS_ENCRYPTION_KEY='+r());console.log('IP_ENCRYPTION_KEY='+r())"
```

O `JWT_SECRET` o Render gera sozinho.

## 1. Banco: Neon

1. Crie uma conta em https://neon.tech e um projeto `naicotech-demo`, região **AWS US East (N. Virginia)**.
2. Em **Connect**, copie a *connection string* (desmarque "Connection pooling"). Ela termina com `?sslmode=require`.

## 2. E-mail: Brevo

O site manda e-mail de confirmação de conta, então precisa de um serviço de envio.

1. Crie uma conta em https://www.brevo.com (grátis, 300 e-mails por dia).
2. **Senders, Domains & Dedicated IPs → Senders**: cadastre e confirme o e-mail remetente.
3. **SMTP & API → SMTP**: gere uma chave SMTP. Os dados são:
   `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER=<login mostrado>`, `SMTP_PASS=<chave SMTP>`,
   `MAIL_FROM="NaicoTech Store <seu-remetente-confirmado>"`.

## 3. Backend: Render

1. Crie uma conta em https://render.com entrando com o GitHub.
2. **New → Blueprint** → escolha o repositório `naicotech-store`. O Render lê o `render.yaml`.
3. Preencha as variáveis pedidas:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | connection string do Neon |
| `FRONTEND_URL` | o endereço do Vercel, ex.: `https://naicotech-store.vercel.app` (ajuste depois se for outro) |
| `PROXY_SECRET`, `TOTP_ENCRYPTION_KEY`, `ADDRESS_ENCRYPTION_KEY`, `IP_ENCRYPTION_KEY` | do passo 0 |
| `MERCADOPAGO_ACCESS_TOKEN` | access token de **teste** (conta de teste do Mercado Pago) |
| `MERCADOPAGO_WEBHOOK_SECRET` | chave do webhook (passo 5) |
| `MELHOR_ENVIO_TOKEN` | token do **sandbox** |
| `MELHOR_ENVIO_USER_AGENT` | `NaicoTech Store (seu-email)` |
| `SHIPPING_ORIGIN_CEP` | um CEP **genérico** de origem (ex.: `20040020`), não o da sua casa |
| `SMTP_*`, `MAIL_FROM` | do passo 2 |

4. Clique em **Apply**. O primeiro deploy leva alguns minutos: instala, aplica as migrações e cria o catálogo de exemplo.
5. Anote o endereço do serviço, ex.: `https://naicotech-api.onrender.com`. Abrir esse endereço direto deve mostrar **"Acesso direto à API não permitido"**: é a proteção funcionando.

## 4. Frontend: Vercel

1. No Vercel: **Add New → Project** → importe o repositório `naicotech-store`.
2. **Root Directory:** `frontend`. O resto vem do `vercel.json`.
3. **Environment Variables:**

| Variável | Valor |
|---|---|
| `API_URL` | endereço do Render (passo 3.5) |
| `PROXY_SECRET` | o **mesmo** do Render |
| `VITE_MP_PUBLIC_KEY` | public key de **teste** do Mercado Pago |
| `VITE_DEMO_MODE` | `true` |

4. **Deploy.** Se o endereço final for diferente do que você pôs em `FRONTEND_URL` no Render, corrija lá (o Render reinicia sozinho).

## 5. Webhook do Mercado Pago

No painel do Mercado Pago (aplicação de teste) → **Webhooks**: URL `https://<seu-site>.vercel.app/api/payments/webhook`, evento **Order**. Copie a chave secreta para `MERCADOPAGO_WEBHOOK_SECRET` no Render.

## 6. Teste

1. Abra o site, crie uma conta e confirme o e-mail.
2. Calcule o frete, finalize um pedido e pague com um [cartão de teste do Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/checkout-api/integration-test/test-cards).
3. Coloque o link no README e no seu site de portfólio.

## Bom saber

- **O Render grátis "dorme"** depois de ~15 min sem acesso. A primeira visita depois disso leva 30 a 60 s; se aparecer "API indisponível", aguarde e recarregue.
- **O banco do Neon grátis** também pausa quando parado e volta sozinho no primeiro acesso.
- **Painel admin:** crie sua conta no site e promova no banco do Neon (SQL Editor): `UPDATE "User" SET role = 'ADMIN' WHERE email = 'seu@email';`. No primeiro acesso a `/admin`, configure o 2FA.
- **Token do Melhor Envio:** se o frete parar de calcular, o token do sandbox pode ter expirado. Gere outro e atualize no Render.
