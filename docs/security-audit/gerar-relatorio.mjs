// Gera o relatório de auditoria de segurança em PDF (A4) a partir dos dados abaixo.
// Sem dependências: monta um HTML com gráficos em SVG e imprime com o Chrome/Edge
// headless via DevTools Protocol (WebSocket nativo do Node 22+).
//
// Uso (na raiz do repositório):
//   node docs/security-audit/gerar-relatorio.mjs
//   node docs/security-audit/gerar-relatorio.mjs --png   (também salva PNG de cada página, para conferência)
// Navegador: detectado automaticamente, ou defina CHROME_PATH.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_PDF = join(HERE, 'relatorio-auditoria-seguranca.pdf')
const OUT_HTML = join(HERE, 'relatorio-auditoria-seguranca.html')
const REPORT_NAME = 'Relatório de Auditoria de Segurança — NaicoTech Store'
const AUDIT_DATE = '10/10/2026'
const COMMIT = '0a161e6 (branch main)'
const FIX_BRANCH = 'fix/auditoria-seguranca'

// Situação de cada achado depois das correções (branch FIX_BRANCH).
const RESOLUTION = {
  F1: 'Corrigido: DELETE /reviews/:id só para o autor; moderação em DELETE /admin/reviews/:id com @AdminOnly() (2FA + auditoria).',
  F2: 'Corrigido: exceção de ADMIN removida de OrdersService.findOne; a rota de cliente atende só o dono.',
  F3: 'Corrigido: a rota pública devolve só o nome reduzido (ex.: "Ana L.").',
  F4: 'Corrigido: validateEnv() recusa segredos de teste (atuais e antigos), chaves repetitivas, e exige SMTP_HOST em produção e PROXY_SECRET no modo demo.',
  F5: 'Corrigido: os testes usam segredos derivados de rótulos públicos, recusados fora de NODE_ENV=test. A senha do Postgres efêmero do CI foi mantida (não protege nada real).',
  F6: 'Corrigido: portas publicadas só em 127.0.0.1.',
  F7: 'Aceito: chave pública por design, nada a corrigir.',
  F8: 'Corrigido: backend recusa URL não-https (502) e o painel só abre https.',
  F9: 'Corrigido: e-mail mascarado no log (maskEmail).',
}

// ---------------------------------------------------------------------------
// Dados da auditoria
// ---------------------------------------------------------------------------

const SEV = {
  critica: { label: 'Crítica', color: '#B91C1C' },
  alta: { label: 'Alta', color: '#EA580C' },
  media: { label: 'Média', color: '#D97706' },
  baixa: { label: 'Baixa', color: '#2563EB' },
  info: { label: 'Informativa', color: '#6B7280' },
}
const STRONG = '#059669'

const CATEGORIES = [
  { id: 1, name: 'Banco sem tranca', short: '1. Isolamento de dono' },
  { id: 2, name: 'Permissão definida no navegador', short: '2. Permissão no navegador' },
  { id: 3, name: 'IDOR', short: '3. IDOR' },
  { id: 4, name: 'Chaves expostas', short: '4. Chaves expostas' },
  { id: 5, name: 'Inputs sem tratamento (XSS)', short: '5. XSS' },
  { id: 0, name: 'Fora das 5 categorias', short: 'Outros' },
]

const FINDINGS = [
  {
    id: 'F1', cat: 2, sev: 'media',
    where: 'backend/src/reviews/reviews.controller.ts:32-36 · reviews.service.ts:58-62',
    title: 'Exclusão de avaliações por ADMIN sem 2FA e sem auditoria',
    desc: 'DELETE /reviews/:id aceita role ADMIN só com o cookie de sessão comum (JwtAuthGuard). Não passa pelo AdminStepUpGuard (2FA) nem pelo AuditInterceptor, que protegem todas as outras ações administrativas. Os IDs das avaliações são públicos em GET /reviews/product/:productId.',
    code: `@Delete(':id')\n@UseGuards(JwtAuthGuard)\nremove(@Req() req, @Param('id', ParseUUIDPipe) id: string) {\n  return this.reviewsService.remove(id, req.user.sub, req.user.role);\n}\n// reviews.service.ts:59\nif (review.userId !== userId && role !== 'ADMIN') { throw new ForbiddenException(...) }`,
    exploit: 'Quem obtiver só a senha de um admin (phishing, reuso de senha) — exatamente o cenário que a 2FA obrigatória existe para barrar — apaga qualquer avaliação da loja, sem deixar registro em AdminAuditLog.',
  },
  {
    id: 'F2', cat: 3, sev: 'baixa',
    where: 'backend/src/orders/orders.service.ts:152-158',
    title: 'GET /orders/:id libera pedido de qualquer cliente para ADMIN sem 2FA',
    desc: 'O dono é verificado, mas há um bypass por papel: role ADMIN lê qualquer pedido com a sessão comum, sem a 2ª etapa e sem auditoria. O painel não usa essa rota (usa /admin/orders), então o bypass é desnecessário.',
    code: `const order = await this.prisma.order.findUnique({ where: { id }, ... });\n// 404 também para pedido de outra pessoa: não confirma que o ID existe.\nif (!order || (order.userId !== userId && role !== 'ADMIN')) {\n  throw new NotFoundException('Pedido não encontrado');\n}`,
    exploit: 'Exige senha de admin + o UUID do pedido (v4, não enumerável; aparece em links de e-mail como /pedidos/<id>). Expõe itens, valores, frete, código de rastreio e o resumo mascarado do endereço.',
  },
  {
    id: 'F3', cat: 1, sev: 'baixa',
    where: 'backend/src/reviews/reviews.service.ts:42-53 (linha 49)',
    title: 'Listagem pública de avaliações expõe o nome completo dos compradores',
    desc: 'A rota pública GET /reviews/product/:productId devolve user.name inteiro de outros usuários; o frontend o exibe (ProductPage.tsx:217). O restante do projeto minimiza dados pessoais (endereço mascarado, só o primeiro nome no Header).',
    code: `select: {\n  id: true, rating: true, comment: true, createdAt: true,\n  user: { select: { name: true } },\n},`,
    exploit: 'Qualquer visitante, sem login, lista o nome completo de quem comprou cada produto (associa pessoa ↔ compra). Exposição de dado pessoal (LGPD, minimização), não de credencial.',
  },
  {
    id: 'F4', cat: 4, sev: 'baixa',
    where: 'backend/src/config/env.ts:2, 17-60',
    title: 'Validação de startup não rejeita as chaves de teste commitadas nem chaves de baixa entropia',
    desc: 'validateEnv() bloqueia só os placeholders do .env.example, tamanho mínimo e formato hex. Os valores fixos de backend/test/setup-env.ts (JWT_SECRET, chaves 0123…/fedc…/0011…) passam em todas as checagens. Em produção, PROXY_SECRET e SMTP_HOST também não são exigidos.',
    code: `const PLACEHOLDERS = ['GERE_UM', 'TROQUE_POR', 'seu-access-token', 'chave-secreta', 'cole-o-token'];\n...\nif (jwtSecret.length < 32) fail(...)\nif (!/^[0-9a-f]{64}$/i.test(totpKey)) fail(...)`,
    exploit: 'Condição: alguém copia os valores dos testes para o .env de produção. Aí o JWT_SECRET é público (forja de sessão de qualquer usuário, inclusive token typ "admin") e as chaves AES de TOTP/endereço/IP também. Verificado: o backend/.env local NÃO usa esses valores.',
  },
  {
    id: 'F5', cat: 4, sev: 'info',
    where: 'backend/test/setup-env.ts:8-31 · .github/workflows/ci.yml:21, 32',
    title: 'Credenciais de teste fixas no repositório',
    desc: 'Segredos falsos dos testes e a senha do Postgres efêmero do CI estão em texto puro. Não dão acesso a nada real; o risco é só alimentar o F4.',
    code: `process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres-0123456789';\nprocess.env.TOTP_ENCRYPTION_KEY = '0123456789abcdef...';\n# ci.yml\nPOSTGRES_PASSWORD: senha-so-do-ci`,
    exploit: 'Não explorável sozinho (banco do CI é descartado ao fim do job; chaves de teste não existem em produção).',
  },
  {
    id: 'F6', cat: 4, sev: 'baixa',
    where: 'docker-compose.yml:11-12, 21-23',
    title: 'Postgres e Mailpit de dev publicados em todas as interfaces de rede',
    desc: 'As portas 5433 (Postgres), 1025 (SMTP) e 8025 (interface web do Mailpit, sem autenticação) são publicadas em 0.0.0.0. O Mailpit guarda os e-mails de verificação e de redefinição de senha com tokens de uso único.',
    code: `ports:\n  - "5433:5432"\n...\nports:\n  - "1025:1025"\n  - "8025:8025"`,
    exploit: 'Condição: máquina de dev numa rede compartilhada (Wi-Fi público, coworking) com o firewall permitindo. Qualquer um na rede abre http://<ip>:8025, lê os links de /redefinir-senha e toma contas de dev (inclusive a de admin local).',
  },
  {
    id: 'F7', cat: 4, sev: 'info',
    where: 'frontend/dist/assets/index-*.js · frontend/src/components/CardPaymentForm.tsx:6',
    title: 'Public Key do Mercado Pago embutida no bundle (esperado)',
    desc: 'Única chave encontrada no bundle compilado: VITE_MP_PUBLIC_KEY (APP_USR-…). É pública por design (só tokeniza cartões no navegador). Nenhum segredo de servidor vai para o bundle: PROXY_SECRET/API_URL são lidos só no middleware do Vercel.',
    code: `const publicKey = import.meta.env.VITE_MP_PUBLIC_KEY`,
    exploit: 'Não explorável. Registrado para documentar a verificação do bundle.',
  },
  {
    id: 'F8', cat: 5, sev: 'info',
    where: 'frontend/src/pages/admin/OrdersTab.tsx:99 · backend/src/shipping/shipments.service.ts:165',
    title: 'URL de impressão da etiqueta aberta sem validar o protocolo',
    desc: 'A URL devolvida pela API do Melhor Envio é repassada ao navegador e aberta com window.open sem checar se é https.',
    code: `const { url } = await guard(adminApi.printLabel(order.id))\nwindow.open(url, '_blank', 'noopener,noreferrer')`,
    exploit: 'Só explorável se a API do Melhor Envio (terceiro confiável, via HTTPS) for comprometida e devolver uma URL javascript:/data:. Defesa em profundidade.',
  },
  {
    id: 'F9', cat: 0, sev: 'info',
    where: 'backend/src/auth/auth.service.ts:243-246',
    title: 'E-mail completo no log quando o envio falha',
    desc: 'Fora das 5 categorias, anotado por contrariar a política do próprio projeto (mail.service.ts:12 e :176 mascaram o e-mail no log).',
    code: `this.logger.error(\`Falha ao enviar e-mail de \${kind} para \${email}\`, error as Error)`,
    exploit: 'Quem tiver acesso aos logs vê e-mails de clientes em claro (dado pessoal).',
  },
]

const CATEGORY_NOTES = {
  1: 'Mecanismo de isolamento: loja single-tenant (sem organização/workspace). O isolamento é por dono, feito à mão: filtro userId nas queries Prisma + guards NestJS. Não há RLS no Postgres (um único usuário de banco), então a proteção depende 100% do código da aplicação.',
  2: 'Gates do frontend: AdminPage.tsx:20/48 (isAdmin) e Header.tsx:98 (link Admin). Todas as 21 chamadas de adminApi (endpoints.ts:87-121) foram cruzadas com o backend: cada uma tem @AdminOnly() ou @Roles(\'ADMIN\')+RolesGuard. O único furo é uma rota sem UI no front (F1).',
  3: 'Todos os 51 handlers de 11 controllers foram percorridos. Todos os :id usam ParseUUIDPipe; nenhuma rota aceita userId vindo do cliente.',
  4: 'Varridos: código, .env.example, docker-compose, render.yaml, vercel.json, CI, scripts, docs, histórico git completo (git log --all -p) e o bundle compilado (frontend/dist).',
  5: 'Nenhum innerHTML, dangerouslySetInnerHTML, eval ou new Function. Não há lib de sanitização porque nenhum ponto renderiza HTML: o React escapa tudo. HTML só é montado nos e-mails, com escapeHtml().',
}

const STRENGTHS = [
  { area: 'Autenticação', text: 'Sessão em cookie httpOnly + SameSite=Strict + Secure em produção; papel, tokenVersion e e-mail verificado relidos do banco a cada requisição (logout e rebaixamento valem na hora); typ "session" vs "admin" impede usar um token pelo outro.', ev: 'auth/session.ts:12-19 · guards/jwt-auth.guard.ts:52-73' },
  { area: 'Painel admin', text: '@AdminOnly() = JwtAuthGuard + RolesGuard + AdminStepUpGuard (2FA TOTP, 30 min) + AuditInterceptor. Aplicado em todas as escritas de produtos/categorias e em todas as rotas /admin do painel.', ev: 'admin/admin-only.decorator.ts:12-17 · products.controller.ts:30-46 · categories.controller.ts:30-46 · admin.controller.ts:130-195' },
  { area: 'Posse (IDOR)', text: 'Pagamento confere o dono (404 para pedido alheio); endereços são removidos/lidos com where {id, userId}; conta, pedidos e endereços usam só req.user.sub; avaliação exige compra própria paga.', ev: 'orders.service.ts:163 · addresses.service.ts:52, 59 · account.controller.ts:37, 44 · reviews.service.ts:16-25' },
  { area: 'Listagens', text: 'GET /orders, /addresses e a exportação LGPD filtram por userId; produtos públicos usam select que omite costPrice; endereços só voltam mascarados.', ev: 'orders.service.ts:143-150 · addresses.service.ts:20-34 · account.service.ts:37-49 · products.service.ts:7-19' },
  { area: 'Integridade de valores', text: 'Preço sempre do banco, frete recotado no servidor, baixa de estoque atômica, webhook com HMAC + tolerância de 15 min, reconsulta ao Mercado Pago e checagem do valor pago.', ev: 'orders.service.ts:82, 105-115 · payments.service.ts:78-93 · payments.controller.ts:55, 71' },
  { area: 'Mass assignment / CSRF', text: 'ValidationPipe com whitelist + forbidNonWhitelisted; CSRF por Origin + exigência de JSON; CORS restrito às origens configuradas.', ev: 'app.setup.ts:38-52 · security/csrf.middleware.ts:14-29' },
  { area: 'Segredos', text: 'Nenhum segredo real no código nem no histórico git; .env ignorado; startup recusa placeholders, JWT < 32 caracteres e chaves AES repetidas; render.yaml usa generateValue/sync:false; sourcemap desligado no build.', ev: 'config/env.ts:2-43 · .gitignore:1 · render.yaml:25-61 · vite.config.ts:30' },
  { area: 'XSS', text: 'CSP com nonce por resposta e frame-ancestors none; imagens de produto só https (@IsUrl); campos de endereço bloqueiam < e >; link de rastreio com encodeURIComponent; e-mails escapam nome, parágrafos e URL do botão.', ev: 'frontend/csp.mjs:19-35 · create-product.dto.ts:44-49 · shipping/address.ts:17 · utils/format.ts:53-54 · mail.service.ts:4-10, 149-172' },
  { area: 'Dados em repouso', text: 'Endereços, segredos TOTP e IPs criptografados com AES-256-GCM, chaves separadas e AAD amarrando o texto ao dono.', ev: 'security/secret-box.ts:10-35 · shipping/address.ts:115-127' },
]

const WEAKNESSES = [
  'Exceções por papel ("role !== \'ADMIN\'") dentro de rotas de cliente contornam a política do painel (2FA + auditoria). É o padrão por trás de F1 e F2: o privilégio existe em dois lugares, e só um deles está blindado.',
  'Sem RLS: o isolamento por dono depende de cada query lembrar o filtro userId. Hoje todas lembram, mas não há segunda camada se uma rota nova esquecer.',
  'A validação de startup confia no formato dos segredos, não na origem: valores de teste públicos passariam em produção (F4).',
  'Infra de desenvolvimento exposta na rede local por padrão (F6).',
]

const RECOMMENDATIONS = [
  { p: 'P1', title: 'Fechar a exclusão de avaliações sem 2FA (F1)', text: 'Tirar o bypass de ADMIN de DELETE /reviews/:id (só o autor apaga) e criar DELETE /admin/reviews/:id com @AdminOnly(), que já traz 2FA e auditoria.' },
  { p: 'P2', title: 'Remover o bypass de ADMIN em GET /orders/:id (F2)', text: 'Rota de cliente atende só o dono. Se o painel precisar ver um pedido, criar GET /admin/orders/:id com @AdminOnly().' },
  { p: 'P2', title: 'Endurecer a validação de segredos (F4, F5)', text: 'Lista de valores proibidos com os segredos de teste, checagem mínima de entropia (bytes distintos) e, com NODE_ENV=production, exigir PROXY_SECRET e SMTP_HOST.' },
  { p: 'P3', title: 'Prender a infra de dev ao localhost (F6)', text: 'Publicar as portas como "127.0.0.1:5433:5432", "127.0.0.1:1025:1025" e "127.0.0.1:8025:8025".' },
  { p: 'P3', title: 'Minimizar o nome nas avaliações públicas (F3)', text: 'Devolver só o primeiro nome (ou "Ana S.") na rota pública, mantendo o nome completo fora da resposta.' },
  { p: 'P4', title: 'Higiene: log e URL de etiqueta (F8, F9)', text: 'Usar maskEmail() no log do AuthService e validar no backend que a URL de impressão é https antes de devolvê-la.' },
]

const ISSUES = [
  {
    title: '[Segurança] Exclusão de avaliações por ADMIN sem verificação em duas etapas nem auditoria',
    labels: ['security', 'severity:medium'],
    body: `## Descrição
\`DELETE /reviews/:id\` permite que uma conta com \`role = ADMIN\` apague a avaliação de **qualquer** usuário usando apenas o cookie de sessão comum. A rota usa só o \`JwtAuthGuard\`, então não passa pelo \`AdminStepUpGuard\` (2FA TOTP) nem pelo \`AuditInterceptor\`, que protegem todas as outras ações administrativas (\`@AdminOnly()\`).

Os IDs das avaliações são públicos em \`GET /reviews/product/:productId\`.

## Por que é explorável
A 2FA obrigatória do painel existe para que **só a senha** de um admin não baste. Aqui basta: quem obtiver a senha (phishing, reuso de senha) faz login, lista os IDs pela rota pública e apaga todas as avaliações. Nada é registrado em \`AdminAuditLog\`.

## Evidência
\`backend/src/reviews/reviews.controller.ts:32-36\`
\`\`\`ts
@Delete(':id')
@UseGuards(JwtAuthGuard)
remove(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
  return this.reviewsService.remove(id, req.user.sub, req.user.role);
}
\`\`\`
\`backend/src/reviews/reviews.service.ts:58-62\`
\`\`\`ts
if (review.userId !== userId && role !== 'ADMIN') {
  throw new ForbiddenException('Acesso negado');
}
await this.prisma.review.delete({ where: { id } });
\`\`\`

## Impacto
Remoção em massa de avaliações (dano à reputação da loja e à prova social) sem rastro de auditoria, contornando a 2FA.

## Sugestão de correção
- Em \`ReviewsService.remove\`, permitir apenas o autor (\`review.userId === userId\`), sem exceção por papel.
- Criar \`DELETE /admin/reviews/:id\` com \`@AdminOnly()\` para moderação (2FA + auditoria automáticas).

## Critérios de aceite
- [ ] \`DELETE /reviews/:id\` com sessão de ADMIN em avaliação de outra pessoa responde 403/404.
- [ ] \`DELETE /admin/reviews/:id\` sem cookie \`naicotech_admin\` válido responde 403 \`ADMIN_2FA_REQUIRED\`.
- [ ] Moderação bem-sucedida cria uma linha em \`AdminAuditLog\`.
- [ ] O autor continua conseguindo apagar a própria avaliação.
- [ ] Testes e2e cobrindo os três casos acima.`,
  },
  {
    title: '[Segurança] GET /orders/:id libera pedido de qualquer cliente para ADMIN sem 2FA',
    labels: ['security', 'severity:low'],
    body: `## Descrição
\`OrdersService.findOne\` confere o dono do pedido, mas abre uma exceção por papel: uma sessão comum de ADMIN lê o pedido de qualquer cliente, sem a 2ª etapa e sem auditoria. O painel não usa essa rota (usa \`/admin/orders\`), então a exceção não é necessária.

## Por que é explorável
Com só a senha de um admin, sem o código TOTP, é possível ler pedidos alheios. Atenuante: é preciso conhecer o UUID (v4, não enumerável). Ele aparece, por exemplo, nos links \`/pedidos/<id>\` dos e-mails de envio/entrega.

## Evidência
\`backend/src/orders/orders.service.ts:152-158\`
\`\`\`ts
async findOne(id: string, userId: string, role: string) {
  const order = await this.prisma.order.findUnique({ where: { id }, include: orderInclude, omit: orderOmit });
  if (!order || (order.userId !== userId && role !== 'ADMIN')) {
    throw new NotFoundException('Pedido não encontrado');
  }
  return order;
}
\`\`\`

## Impacto
Leitura de itens, valores, frete, código de rastreio e resumo do endereço de clientes sem passar pela 2FA nem deixar registro.

## Sugestão de correção
- Remover \`role !== 'ADMIN'\` (e o parâmetro \`role\`) de \`findOne\`: a rota de cliente atende só o dono.
- Se o painel precisar do detalhe, criar \`GET /admin/orders/:id\` com \`@AdminOnly()\`.

## Critérios de aceite
- [ ] \`GET /orders/:id\` de outro cliente com sessão de ADMIN responde 404.
- [ ] O dono continua lendo o próprio pedido.
- [ ] Teste e2e cobrindo o caso do ADMIN.`,
  },
  {
    title: '[Segurança] Validação de startup aceita os segredos de teste commitados e chaves de baixa entropia',
    labels: ['security', 'severity:low'],
    body: `## Descrição
\`validateEnv()\` rejeita só os placeholders do \`.env.example\`, além de checar tamanho e formato. Os segredos **públicos** de \`backend/test/setup-env.ts\` passam em todas as checagens, assim como chaves triviais (\`000…0\`, \`111…1\`, \`222…2\`). Em produção também não exige \`PROXY_SECRET\` nem \`SMTP_HOST\` (sem eles, a API aceita acesso direto e o e-mail cai em \`localhost:1025\`).

Agrupa também os segredos de teste fixos (\`setup-env.ts\`) e a senha do Postgres efêmero do CI, que são inofensivos sozinhos mas alimentam o risco acima.

## Por que é explorável
Condição: alguém copia os valores dos testes para o \`.env\` de produção (ex.: "para testar rapidinho"). Com o \`JWT_SECRET\` público, qualquer pessoa forja cookies \`naicotech_session\` **e** \`naicotech_admin\` (typ \`admin\`) para qualquer usuário. Com as chaves AES públicas, um vazamento do banco revela endereços, segredos TOTP e IPs.

Verificado: o \`backend/.env\` local atual **não** usa esses valores.

## Evidência
\`backend/src/config/env.ts:2\`
\`\`\`ts
const PLACEHOLDERS = ['GERE_UM', 'TROQUE_POR', 'seu-access-token', 'chave-secreta', 'cole-o-token'];
\`\`\`
\`backend/src/config/env.ts:20-31\`
\`\`\`ts
const jwtSecret = required('JWT_SECRET');
if (jwtSecret.length < 32) { fail(...) }
...
if (!/^[0-9a-f]{64}$/i.test(totpKey)) { fail(...) }
\`\`\`
\`backend/test/setup-env.ts:8, 12, 15, 31\`
\`\`\`ts
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres-0123456789';
process.env.TOTP_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.ADDRESS_ENCRYPTION_KEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
process.env.IP_ENCRYPTION_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
\`\`\`
\`.github/workflows/ci.yml:21, 32\`: \`POSTGRES_PASSWORD: senha-so-do-ci\`

## Impacto
Se a condição ocorrer: tomada de qualquer conta, inclusive do painel admin com 2FA, e quebra da criptografia dos dados em repouso.

## Sugestão de correção
- Exportar os valores de teste numa constante compartilhada e recusá-los em \`validateEnv()\` (fora de \`NODE_ENV=test\`).
- Checagem mínima de entropia: por exemplo, recusar chaves com menos de 16 bytes distintos.
- Com \`NODE_ENV=production\`, exigir \`PROXY_SECRET\` (quando \`DEMO_MODE=true\` ou atrás do Vercel) e \`SMTP_HOST\`.

## Critérios de aceite
- [ ] A API não sobe com \`NODE_ENV=production\` usando qualquer segredo de \`setup-env.ts\`.
- [ ] A API não sobe com chave AES \`000…0\` / \`111…1\`.
- [ ] Em produção, ausência de \`SMTP_HOST\` (e de \`PROXY_SECRET\` no modo demo) impede a subida, com mensagem clara.
- [ ] Os testes e2e continuam passando.`,
  },
  {
    title: '[Segurança] docker-compose publica Postgres e Mailpit de dev em todas as interfaces',
    labels: ['security', 'severity:low'],
    body: `## Descrição
O \`docker-compose.yml\` publica as portas do Postgres (5433), do SMTP do Mailpit (1025) e da **interface web do Mailpit (8025, sem autenticação)** em \`0.0.0.0\`. O Mailpit guarda os e-mails de verificação e de redefinição de senha, que contêm tokens de uso único.

## Por que é explorável
Condição: a máquina de desenvolvimento está numa rede compartilhada (Wi-Fi público, coworking) e o firewall permite a conexão. Qualquer pessoa na rede abre \`http://<ip-da-máquina>:8025\`, pede "esqueci minha senha" para uma conta conhecida e lê o link no Mailpit, tomando a conta (inclusive a de admin local). O Postgres também fica acessível, protegido só pela senha do \`.env\`.

## Evidência
\`docker-compose.yml:11-12\`
\`\`\`yaml
ports:
  - "5433:5432"
\`\`\`
\`docker-compose.yml:21-23\`
\`\`\`yaml
ports:
  - "1025:1025"
  - "8025:8025"
\`\`\`

## Impacto
Tomada de contas do ambiente de desenvolvimento e acesso ao banco local (que pode conter dados de teste realistas).

## Sugestão de correção
\`\`\`yaml
ports:
  - "127.0.0.1:5433:5432"
...
ports:
  - "127.0.0.1:1025:1025"
  - "127.0.0.1:8025:8025"
\`\`\`

## Critérios de aceite
- [ ] \`docker compose ps\` mostra as três portas ligadas em \`127.0.0.1\`.
- [ ] De outra máquina da rede, as portas 5433, 1025 e 8025 não respondem.
- [ ] Backend, testes e Mailpit continuam funcionando localmente.`,
  },
  {
    title: '[Segurança] Avaliações públicas expõem o nome completo dos compradores',
    labels: ['security', 'severity:low'],
    body: `## Descrição
A rota pública \`GET /reviews/product/:productId\` devolve \`user.name\` completo de quem avaliou, e a página do produto exibe esse nome. O resto do projeto segue minimização de dados (endereço mascarado, só o primeiro nome no cabeçalho).

## Por que é explorável
Qualquer visitante, sem login, associa o nome completo de uma pessoa à compra de um produto específico. Não é furo de autorização, é exposição de dado pessoal além do necessário (LGPD, art. 6º, III).

## Evidência
\`backend/src/reviews/reviews.service.ts:42-53\`
\`\`\`ts
findByProduct(productId: string) {
  return this.prisma.review.findMany({
    where: { productId },
    select: {
      id: true, rating: true, comment: true, createdAt: true,
      user: { select: { name: true } },
    },
\`\`\`
\`frontend/src/pages/ProductPage.tsx:217\`: \`<strong>{r.user.name}</strong>\`

## Impacto
Exposição pública de nome completo + histórico de compra.

## Sugestão de correção
Mapear a resposta para um nome de exibição reduzido (ex.: "Ana S."), sem enviar o nome completo ao navegador.

## Critérios de aceite
- [ ] A resposta de \`GET /reviews/product/:id\` não contém o nome completo.
- [ ] A página do produto mostra o nome reduzido.
- [ ] Teste cobrindo o formato do nome devolvido.`,
  },
  {
    title: '[Segurança] Higiene: e-mail em claro no log e URL da etiqueta sem validação de protocolo',
    labels: ['security', 'severity:info'],
    body: `## Descrição
Dois pontos pequenos de defesa em profundidade:

1. \`AuthService.deliver\` escreve o e-mail completo do cliente no log quando o envio falha, contrariando a política do próprio projeto (o \`MailService\` mascara o e-mail).
2. A URL de impressão da etiqueta vem da API do Melhor Envio e é aberta pelo painel com \`window.open\` sem checar se é \`https:\`.

## Por que é explorável
1. Quem tiver acesso aos logs (provedor de hospedagem, ferramenta de logs) vê e-mails de clientes.
2. Só se a API do Melhor Envio for comprometida e devolver \`javascript:\`/\`data:\`. Improvável, mas a checagem é barata.

## Evidência
\`backend/src/auth/auth.service.ts:243-246\`
\`\`\`ts
private deliver(kind: string, email: string, send: () => Promise<void>) {
  send().catch((error) =>
    this.logger.error(\`Falha ao enviar e-mail de \${kind} para \${email}\`, error as Error),
  );
}
\`\`\`
\`backend/src/shipping/shipments.service.ts:165\`: \`return { url: await this.melhorEnvio.printUrl(order.shipmentId) };\`
\`frontend/src/pages/admin/OrdersTab.tsx:99\`: \`window.open(url, '_blank', 'noopener,noreferrer')\`

## Impacto
Exposição de dado pessoal em logs; risco residual de execução de script no painel admin.

## Sugestão de correção
- Exportar \`maskEmail\` do \`MailService\` (ou um util comum) e usá-lo no log do \`AuthService\`.
- Em \`ShipmentsService.printUrl\`, validar \`new URL(url).protocol === 'https:'\` (e, se quiser, o host do Melhor Envio) antes de devolver.

## Critérios de aceite
- [ ] Nenhum log do backend contém um e-mail completo (grep nos testes de falha de envio).
- [ ] \`printUrl\` com URL não-https responde erro e não repassa a URL.
- [ ] Teste unitário para cada um dos dois casos.`,
  },
]

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const SEV_ORDER = ['critica', 'alta', 'media', 'baixa', 'info']
const counts = Object.fromEntries(SEV_ORDER.map((s) => [s, FINDINGS.filter((f) => f.sev === s).length]))
const total = FINDINGS.length

const chip = (sev) => `<span class="chip" style="background:${SEV[sev].color}">${SEV[sev].label}</span>`

function donut() {
  const size = 220
  const r = 80
  const stroke = 34
  const c = 2 * Math.PI * r
  const gap = 3
  let offset = 0
  const segs = SEV_ORDER.filter((s) => counts[s] > 0).map((s) => {
    const len = (counts[s] / total) * c
    const seg = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${SEV[s].color}" stroke-width="${stroke}"
      stroke-dasharray="${Math.max(len - gap, 0)} ${c}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`
    offset += len
    return seg
  })
  const legend = SEV_ORDER.map(
    (s) => `<li><span class="sw" style="background:${SEV[s].color}"></span>${SEV[s].label}<b>${counts[s]}</b></li>`,
  ).join('')
  return `<figure class="chart">
    <figcaption>Achados por severidade</figcaption>
    <div class="donut-wrap">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Rosca: achados por severidade">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#EEF0F3" stroke-width="${stroke}"/>
        ${segs.join('')}
        <text x="50%" y="47%" text-anchor="middle" class="donut-num">${total}</text>
        <text x="50%" y="59%" text-anchor="middle" class="donut-lbl">achados</text>
      </svg>
      <ul class="legend">${legend}</ul>
    </div>
  </figure>`
}

function bars() {
  const rows = CATEGORIES.map((cat) => {
    const list = FINDINGS.filter((f) => f.cat === cat.id)
    return { cat, list, n: list.length }
  })
  const max = Math.max(...rows.map((r) => r.n), 1)
  const labelW = 170
  const barMax = 250
  const rowH = 34
  const unit = barMax / max
  const h = rows.length * rowH + 10
  const svgRows = rows.map((row, i) => {
    const y = i * rowH + 6
    let x = labelW
    const segs = SEV_ORDER.map((s) => {
      const k = row.list.filter((f) => f.sev === s).length
      if (!k) return ''
      const w = k * unit
      const rect = `<rect x="${x}" y="${y}" width="${Math.max(w - 2, 1)}" height="20" rx="4" fill="${SEV[s].color}"/>`
      x += w
      return rect
    }).join('')
    const value = row.n
      ? `<text x="${x + 6}" y="${y + 15}" class="bar-val">${row.n}</text>`
      : `<text x="${labelW + 2}" y="${y + 15}" class="bar-zero">0 — nenhum achado</text>`
    return `<text x="${labelW - 10}" y="${y + 15}" text-anchor="end" class="bar-lbl">${esc(row.cat.short)}</text>${segs}${value}`
  })
  const legend = SEV_ORDER.filter((s) => counts[s] > 0)
    .map((s) => `<li><span class="sw" style="background:${SEV[s].color}"></span>${SEV[s].label}</li>`)
    .join('')
  return `<figure class="chart">
    <figcaption>Achados por categoria (empilhado por severidade)</figcaption>
    <svg width="${labelW + barMax + 50}" height="${h}" viewBox="0 0 ${labelW + barMax + 50} ${h}" role="img" aria-label="Barras: achados por categoria">
      <line x1="${labelW}" y1="0" x2="${labelW}" y2="${h}" stroke="#D0D5DD" stroke-width="1"/>
      ${svgRows.join('')}
    </svg>
    <ul class="legend inline">${legend}</ul>
  </figure>`
}

function findingsTables() {
  return CATEGORIES.map((cat) => {
    const list = FINDINGS.filter((f) => f.cat === cat.id)
    const note = CATEGORY_NOTES[cat.id] ? `<p class="cat-note">${esc(CATEGORY_NOTES[cat.id])}</p>` : ''
    const heading = `<h3>${cat.id ? `Categoria ${cat.id} — ` : ''}${esc(cat.name)}</h3>`
    // Título e nota dentro do thead: o Chrome não separa o thead da 1ª linha e o repete
    // nas páginas de continuação (sem isso o título ficava órfão no pé da página).
    if (!list.length) return `<section class="cat">${heading}${note}<p class="none">Nenhum achado nesta categoria.</p></section>`
    return `<section class="cat"><table class="findings">
          <thead><tr class="cat-head"><td colspan="3">${heading}${note}</td></tr>
          <tr><th style="width:15%">Severidade</th><th style="width:30%">Arquivo:linha</th><th>Descrição</th></tr></thead>
          <tbody>${list
            .map(
              (f) => `<tr>
                <td>${chip(f.sev)}<div class="fid">${f.id}</div><div class="fixed">${RESOLUTION[f.id].startsWith("Aceito") ? "Aceito" : "Corrigido"}</div></td>
                <td class="mono">${f.where.split(" · ").map((p) => esc(p).replaceAll('/', '/<wbr>')).join("<br>")}</td>
                <td><b>${esc(f.title)}</b><br>${esc(f.desc)}
                  <pre>${esc(f.code)}</pre>
                  <div class="exploit"><b>Explorabilidade:</b> ${esc(f.exploit)}</div>
                  <div class="resolution">${esc(RESOLUTION[f.id])}</div></td>
              </tr>`,
            )
            .join('')}</tbody></table></section>`
  }).join('')
}

function html() {
  const sevCards = SEV_ORDER.map(
    (s) => `<div class="stat" style="border-top-color:${SEV[s].color}"><div class="stat-n">${counts[s]}</div><div class="stat-l">${SEV[s].label}</div></div>`,
  ).join('')

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(REPORT_NAME)}</title>
<style>
  @page { size: A4; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Roboto, Arial, sans-serif; color: #1B1F27; font-size: 10pt; line-height: 1.45; margin: 0; }
  h1, h2, h3 { color: #101828; line-height: 1.2; }
  h2 { font-size: 17pt; margin: 0 0 10px; padding-bottom: 6px; border-bottom: 2px solid #E4E7EC; }
  h3 { font-size: 12.5pt; margin: 18px 0 6px; }
  .page-break { break-before: page; }
  .mono, pre, code { font-family: Consolas, "Cascadia Mono", monospace; }
  /* Capa */
  .cover { height: 247mm; display: flex; flex-direction: column; }
  .cover .band { background: linear-gradient(135deg, #0F172A, #1E293B); color: #fff; border-radius: 10px; padding: 34px 30px; }
  .cover .kicker { text-transform: uppercase; letter-spacing: .14em; font-size: 9pt; color: #5EEAD4; font-weight: 600; }
  .cover h1 { color: #fff; font-size: 25pt; margin: 10px 0 6px; }
  .cover .sub { color: #CBD5E1; font-size: 11pt; }
  .meta { display: grid; grid-template-columns: 130px 1fr; gap: 6px 14px; margin: 22px 0 6px; font-size: 10pt; }
  .meta dt { color: #667085; font-weight: 600; }
  .meta dd { margin: 0; }
  .method { font-size: 9.2pt; border-collapse: collapse; width: 100%; margin-top: 8px; }
  .method th, .method td { border: 1px solid #E4E7EC; padding: 5px 7px; vertical-align: top; text-align: left; }
  .method th { background: #F2F4F7; }
  /* Resumo */
  .stats { display: flex; gap: 10px; margin: 6px 0 14px; }
  .stat { flex: 1; border: 1px solid #E4E7EC; border-top: 5px solid; border-radius: 8px; padding: 8px 10px; }
  .stat-n { font-size: 20pt; font-weight: 700; }
  .stat-l { color: #475467; font-size: 9pt; }
  .charts { display: flex; gap: 14px; align-items: flex-start; }
  .chart { margin: 0; border: 1px solid #E4E7EC; border-radius: 8px; padding: 10px 12px; break-inside: avoid; }
  .chart figcaption { font-weight: 600; margin-bottom: 6px; }
  .donut-wrap { display: flex; align-items: center; gap: 12px; }
  .donut-num { font-size: 34px; font-weight: 700; fill: #101828; }
  .donut-lbl { font-size: 12px; fill: #667085; }
  .legend { list-style: none; padding: 0; margin: 0; font-size: 9.5pt; }
  .legend li { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
  .legend li b { margin-left: auto; padding-left: 10px; }
  .legend.inline { display: flex; gap: 14px; margin-top: 4px; }
  .sw { width: 11px; height: 11px; border-radius: 3px; display: inline-block; }
  .bar-lbl { font-size: 11px; fill: #344054; }
  .bar-val { font-size: 11px; font-weight: 700; fill: #101828; }
  .bar-zero { font-size: 10px; fill: #98A2B3; }
  .verdict { background: #F0FDF4; border: 1px solid #BBF7D0; border-left: 5px solid ${STRONG}; border-radius: 8px; padding: 10px 12px; margin-top: 12px; }
  /* Pontos fortes/fracos */
  .strong { border-left: 4px solid ${STRONG}; background: #F6FEF9; padding: 7px 10px; margin: 7px 0; border-radius: 0 6px 6px 0; break-inside: avoid; }
  .strong b { color: #05603A; }
  .ev { color: #475467; font-size: 8.5pt; font-family: Consolas, monospace; margin-top: 2px; }
  .weak { border-left: 4px solid ${SEV.media.color}; background: #FFFAEB; padding: 7px 10px; margin: 7px 0; border-radius: 0 6px 6px 0; break-inside: avoid; }
  /* Tabelas de achados */
  .cat-note { color: #475467; font-size: 9.2pt; margin: 0 0 6px; }
  table.findings { width: 100%; border-collapse: collapse; font-size: 9pt; }
  table.findings th { background: #101828; color: #fff; text-align: left; padding: 6px 7px; }
  table.findings td { border-bottom: 1px solid #E4E7EC; padding: 7px; vertical-align: top; }
  table.findings tr { break-inside: avoid; }
  .chip { display: inline-block; color: #fff; border-radius: 999px; padding: 2px 9px; font-size: 8.3pt; font-weight: 700; white-space: nowrap; }
  .fid { color: #667085; font-size: 8.5pt; margin-top: 4px; font-weight: 600; }
  td.mono { font-size: 8.3pt; overflow-wrap: anywhere; }
  .cat { margin-top: 14px; }
  tr.cat-head td { border: 0; padding: 0 0 4px; }
  tr.cat-head h3 { margin: 0 0 4px; }
  table.findings pre { background: #F8F9FB; border: 1px solid #E4E7EC; border-radius: 5px; padding: 5px 7px; font-size: 7.8pt; white-space: pre-wrap; word-break: break-word; margin: 5px 0; }
  .exploit { font-size: 8.8pt; color: #344054; }
  .fixed { display: inline-block; margin-top: 6px; color: #fff; background: #059669; border-radius: 999px; padding: 1px 8px; font-size: 7.8pt; font-weight: 700; }
  .resolution { margin-top: 5px; font-size: 8.8pt; color: #05603A; background: #ECFDF3; border-left: 3px solid #059669; padding: 4px 7px; border-radius: 0 4px 4px 0; }
  .none { color: ${STRONG}; font-weight: 600; }
  /* Recomendações */
  .rec { display: flex; gap: 10px; border: 1px solid #E4E7EC; border-radius: 8px; padding: 8px 10px; margin: 7px 0; break-inside: avoid; }
  .prio { font-weight: 800; color: #fff; border-radius: 6px; padding: 4px 8px; height: fit-content; }
  /* Issues */
  .issue { margin: 12px 0; }
  .issue-head { font-family: Consolas, monospace; font-size: 8.5pt; color: #667085; }
  .issue pre { background: #F8FAFC; color: #1B1F27; border: 1px solid #D0D5DD; border-radius: 8px; padding: 10px 12px; font-size: 7.9pt; line-height: 1.4; white-space: pre-wrap; word-break: break-word; margin: 4px 0; }
</style></head><body>

<section class="cover">
  <div class="band">
    <div class="kicker">Auditoria de segurança · código-fonte</div>
    <h1>Relatório de Auditoria de Segurança — NaicoTech Store</h1>
    <div class="sub">Isolamento de dados, permissões, IDOR, segredos e XSS</div>
  </div>
  <dl class="meta">
    <dt>Data</dt><dd>${AUDIT_DATE}</dd>
    <dt>Versão auditada</dt><dd>commit ${COMMIT}</dd>
    <dt>Escopo</dt><dd>backend/ (NestJS: 11 controllers, 51 handlers, serviços, guards, middlewares), frontend/ (React: páginas, componentes, cliente da API, server.mjs, middleware.js, CSP), prisma/, scripts/, docker-compose.yml, render.yaml, vercel.json, .github/workflows/ci.yml, docs/, histórico git completo e bundle compilado (frontend/dist).</dd>
    <dt>Stack detectada</dt><dd>TypeScript · NestJS 12 · Prisma 7 + PostgreSQL 16 · sessão JWT HS256 em cookie httpOnly + 2FA TOTP para admin · React 19 + Vite · deploy Render (API) + Vercel (front com proxy) · Docker Compose (dev) · GitHub Actions (CI).</dd>
    <dt>Resultado</dt><dd><b>${total} achados</b>: nenhum crítico ou alto · ${counts.media} médio · ${counts.baixa} baixos · ${counts.info} informativos.</dd>
    <dt>Situação</dt><dd><b style="color:#059669">8 corrigidos e 1 aceito</b> (F7, chave pública por design) no branch <code>${FIX_BRANCH}</code>, com testes automatizados para cada correção.</dd>
  </dl>
  <h3>Nota metodológica — como cada categoria foi mapeada para a stack</h3>
  <table class="method">
    <tr><th style="width:26%">Categoria</th><th>Equivalente nesta stack e o que foi verificado</th></tr>
    <tr><td>1. Banco sem tranca</td><td>Sem Supabase/RLS. Loja single-tenant: o isolamento é por <b>dono</b>, via filtro manual <code>userId</code> nas queries Prisma e <code>req.user.sub</code> vindo do guard. Todas as queries de listagem, exportação e agregação foram conferidas.</td></tr>
    <tr><td>2. Permissão no navegador</td><td>Gates de papel do React (<code>isAdmin</code>, <code>user.role</code>) cruzados um a um com as rotas do NestJS e seus guards (<code>@AdminOnly</code>, <code>@Roles</code>, <code>RolesGuard</code>, <code>AdminStepUpGuard</code>), incluindo exceções por papel dentro dos serviços.</td></tr>
    <tr><td>3. IDOR</td><td>Todos os handlers com <code>:id</code> no path, query ou body (inclusive <code>addressId</code> e <code>productId</code>) verificados quanto à posse no serviço.</td></tr>
    <tr><td>4. Chaves expostas</td><td>Grep de padrões de chave/token no código, configs, CI, scripts e docs; leitura de <code>validateEnv()</code>; <code>git log --all -p</code>; varredura do bundle Vite; conferência (sem imprimir valores) de que os .env locais não reaproveitam valores públicos.</td></tr>
    <tr><td>5. XSS</td><td>Front: sinks de HTML, <code>href/src</code> dinâmicos, <code>window.open</code>, eval, CSP. Back: HTML dos e-mails (nodemailer) e respostas. Não há templates server-side nem markdown.</td></tr>
  </table>
</section>

<section class="page-break">
  <h2>Resumo executivo</h2>
  <div class="stats">${sevCards}</div>
  <div class="charts">${donut()}${bars()}</div>
  <div class="verdict"><b>Leitura geral:</b> a base é defensiva e consistente — sessão revalidada no banco a cada requisição, painel admin com 2FA obrigatória e auditoria, posse verificada em todas as rotas de cliente, nenhum segredo real no código ou no histórico e nenhum sink de XSS. O risco mais relevante (médio) é uma rota de moderação que aceita o papel ADMIN sem passar pela 2FA, contornando a principal defesa do painel. <b>Situação:</b> todos os achados acionáveis foram corrigidos no branch <code>${FIX_BRANCH}</code>; as seções abaixo descrevem o estado auditado (commit ${COMMIT}).</div>

  <h3>Pontos fracos (riscos centrais)</h3>
  ${WEAKNESSES.map((w) => `<div class="weak">${esc(w)}</div>`).join('')}
</section>

<section class="page-break">
  <h2>Pontos fortes (verificados no código)</h2>
  ${STRENGTHS.map((s) => `<div class="strong"><b>${esc(s.area)}.</b> ${esc(s.text)}<div class="ev">${esc(s.ev)}</div></div>`).join('')}
</section>

<section class="page-break">
  <h2>Achados detalhados por categoria</h2>
  ${findingsTables()}
</section>

<section class="page-break">
  <h2>Recomendações priorizadas</h2>
  ${RECOMMENDATIONS.map((r) => {
    const color = { P1: SEV.media.color, P2: SEV.baixa.color, P3: SEV.baixa.color, P4: SEV.info.color }[r.p]
    return `<div class="rec"><span class="prio" style="background:${color}">${r.p}</span><div><b>${esc(r.title)}</b><br>${esc(r.text)}</div></div>`
  }).join('')}
</section>

<section class="page-break">
  <h2>ISSUES PARA O GITHUB</h2>
  <p>Uma issue por achado acionável; achados triviais do mesmo tema foram agrupados (F4+F5 e F8+F9). F7 não gera issue (chave pública por design). Copie o conteúdo entre os delimitadores. <b>Todas já foram resolvidas no branch <code>${FIX_BRANCH}</code></b>; o texto fica como registro do problema e dos critérios de aceite usados.</p>
  ${ISSUES.map((issue, i) => {
    const n = i + 1
    const md = `# ${issue.title}\n\n**Labels sugeridas:** ${issue.labels.map((l) => `\`${l}\``).join(', ')}\n\n${issue.body}`
    return `<div class="issue"><div class="issue-head">--- ISSUE ${n} ---</div><pre>${esc(md)}</pre><div class="issue-head">--- FIM ISSUE ${n} ---</div></div>`
  }).join('')}
</section>
</body></html>`
}

// ---------------------------------------------------------------------------
// Impressão via Chrome DevTools Protocol
// ---------------------------------------------------------------------------

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean)
  const found = candidates.find((p) => existsSync(p))
  if (!found) throw new Error('Chrome/Edge não encontrado. Defina CHROME_PATH.')
  return found
}

async function withBrowser(fn) {
  const profile = mkdtempSync(join(tmpdir(), 'audit-pdf-'))
  const proc = spawn(findBrowser(), ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = ''
    const t = setTimeout(() => reject(new Error('Navegador não respondeu')), 20000)
    proc.stderr.on('data', (d) => {
      buf += d
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/)
      if (m) { clearTimeout(t); resolve(m[1]) }
    })
  })
  const port = new URL(wsUrl).port
  try {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    const page = targets.find((t) => t.type === 'page')
    const ws = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
    let id = 0
    const pending = new Map()
    const listeners = []
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id)
        pending.delete(msg.id)
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
      } else if (msg.method) listeners.forEach((l) => l(msg))
    }
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const n = ++id
      pending.set(n, { resolve, reject })
      ws.send(JSON.stringify({ id: n, method, params }))
    })
    const waitFor = (method) => new Promise((resolve) => listeners.push((m) => m.method === method && resolve(m)))
    const result = await fn({ send, waitFor })
    ws.close()
    return result
  } finally {
    proc.kill()
    await new Promise((r) => setTimeout(r, 500))
    rmSync(profile, { recursive: true, force: true, maxRetries: 5 })
  }
}

const CM = 1 / 2.54
const headerFooterStyle = 'font-family:Segoe UI,Arial,sans-serif;font-size:8px;color:#667085;width:100%;padding:0 2cm;display:flex;justify-content:space-between;'

async function main() {
  mkdirSync(HERE, { recursive: true })
  writeFileSync(OUT_HTML, html())
  const wantPng = process.argv.includes('--png')

  await withBrowser(async ({ send, waitFor }) => {
    await send('Page.enable')
    const loaded = waitFor('Page.loadEventFired')
    await send('Page.navigate', { url: pathToFileURL(OUT_HTML).href })
    await loaded
    const { data } = await send('Page.printToPDF', {
      paperWidth: 21 * CM,
      paperHeight: 29.7 * CM,
      marginTop: 2 * CM,
      marginBottom: 2 * CM,
      marginLeft: 2 * CM,
      marginRight: 2 * CM,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="${headerFooterStyle}"><span>${esc(REPORT_NAME)}</span><span>${AUDIT_DATE}</span></div>`,
      footerTemplate: `<div style="${headerFooterStyle}"><span>NaicoTech Store · auditoria de segurança</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`,
    })
    writeFileSync(OUT_PDF, Buffer.from(data, 'base64'))

    if (wantPng) {
      // Conferência visual: abre o próprio PDF no visualizador do navegador e fotografa as páginas.
      const dir = join(HERE, 'preview')
      mkdirSync(dir, { recursive: true })
      await send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1160, deviceScaleFactor: 1, mobile: false })
      const pdfText = (await import('node:fs')).readFileSync(OUT_PDF, 'latin1')
      const count = (pdfText.match(/\/Type\s*\/Page[^s]/g) ?? []).length
      for (let n = 1; n <= count; n++) {
        // O visualizador de PDF não dispara load de forma confiável: espera fixa.
        await send('Page.navigate', { url: 'about:blank' })
        await new Promise((r) => setTimeout(r, 300))
        await send('Page.navigate', { url: `${pathToFileURL(OUT_PDF).href}#page=${n}&toolbar=0&navpanes=0&view=Fit` })
        await new Promise((r) => setTimeout(r, 2500))
        const shot = await send('Page.captureScreenshot', { format: 'png' })
        writeFileSync(join(dir, `pagina-${String(n).padStart(2, '0')}.png`), Buffer.from(shot.data, 'base64'))
      }
    }
  })

  const pdf = (await import('node:fs')).readFileSync(OUT_PDF, 'latin1')
  const pages = (pdf.match(/\/Type\s*\/Page[^s]/g) ?? []).length
  console.log(`PDF gerado: ${OUT_PDF} (${pages} páginas)`)
  console.log(`HTML-fonte: ${OUT_HTML}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
