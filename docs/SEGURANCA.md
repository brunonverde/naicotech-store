# Segurança da NaicoTech Store

Resumo das proteções, do que ainda falta para uma operação real e do que fazer se algo der errado.

## 1. Camadas de proteção

| Área | Proteção |
|---|---|
| Senhas | bcrypt (12 rounds); respostas que não revelam se um e-mail existe |
| Sessão | JWT em cookie `httpOnly` + `SameSite=Strict` (+ `Secure` em produção); versão da sessão conferida no banco a cada requisição |
| Navegador | CSP com nonce, helmet, CORS fechado, CSRF por origem + corpo JSON |
| Abuso | Rate limit por IP em todas as rotas, mais rígido em login, cadastro, pagamento, cotação e LGPD |
| Painel admin | 2FA TOTP obrigatório, sessão própria de 30 min, bloqueio após 5 erros, auditoria de todas as ações |
| Pagamento | Cartão tokenizado pelo Mercado Pago; valor sempre do banco; webhook assinado, anti-replay e idempotente |
| Frete | Preço recotado no servidor; cache de cotações; CEP validado antes de chamar serviços externos (sem SSRF) |
| Dados pessoais | Endereço/CPF/telefone com AES-256-GCM e AAD ligado ao dono; API só devolve versões mascaradas; logs sem dados pessoais |
| LGPD | Consentimento para salvar endereço; exportação e exclusão de conta com senha; apagamento automático de endereços antigos |
| Configuração | Backend não sobe com segredo ausente, de exemplo ou fraco; chaves de criptografia separadas por finalidade |
| Testes | Testes e2e cobrindo IDOR, adulteração de preço, replay, CSRF, força bruta, criptografia e exclusão de conta |

## 2. Riscos conhecidos e aceitos

- **Alertas do `npm audit` no Prisma CLI** (`mysql2`, `deepmerge-ts`): vêm da ferramenta de migração, não do código que roda na loja. O projeto não usa MySQL, e o leitor de configuração só lê arquivos do próprio projeto. A correção automática rebaixaria o Prisma, então o plano é atualizar quando sair a versão corrigida.
- **Rate limit em memória:** funciona com uma instância do backend. Com várias instâncias, precisa de armazenamento compartilhado (Redis).
- **Seguro do frete sem CNPJ:** limitado a R$ 1.000 por pacote (regra do Melhor Envio para declaração de conteúdo).

## 3. Antes de operar de verdade

- [ ] HTTPS, `NODE_ENV=production`, `TRUST_PROXY` correto e credenciais de produção (Mercado Pago e Melhor Envio).
- [ ] Banco sem porta exposta na internet, senha forte e usuário sem permissão de superusuário.
- [ ] Segredos no gerenciador da hospedagem (não em arquivos soltos no servidor).
- [ ] Backup automático e criptografado do banco, com **teste de restauração**.
- [ ] Cloudflare (ou similar) na frente do site: WAF e proteção contra DDoS.
- [ ] Monitoramento: alerta se o site cair, se houver pico de 401/429 ou se o webhook falhar.
- [ ] Provedor de e-mail com SPF, DKIM e DMARC.
- [ ] `VITE_DEMO_MODE=false` e identificação do vendedor preenchida (Decreto 7.962/2013).
- [ ] `npm audit` sem alertas novos; teste de invasão por terceiros quando houver movimento.

## 4. Plano de resposta a incidentes

**Incidente** = suspeita de acesso indevido, vazamento de dados, segredo exposto (ex.: `.env` publicado) ou ataque em andamento.

### Primeira hora: conter
1. Anote a hora e o que foi observado (prints, logs). Não apague nada.
2. Se um segredo vazou, troque-o (seção 5). Na dúvida, troque todos.
3. Derrube as sessões: trocar o `JWT_SECRET` desloga todo mundo na hora.
4. Se o servidor foi invadido, tire-o do ar (ou bloqueie o acesso externo) antes de investigar.

### Primeiras 24 horas: entender
5. Descubra **o que** foi acessado e **de quem**: auditoria do painel (`AdminAuditLog`), logs do backend, logs da hospedagem e do banco.
6. Confira no Mercado Pago e no Melhor Envio se houve cobranças, estornos ou etiquetas estranhas.
7. Corrija a falha que permitiu o incidente e adicione um teste que a reproduza.

### Comunicar (LGPD, art. 48)
8. Se houver risco ou dano relevante aos titulares (ex.: CPF, endereço ou e-mails vazados), comunique à **ANPD** e aos **clientes afetados** em até **3 dias úteis** (Resolução CD/ANPD nº 15/2024), informando:
   - quais dados foram afetados;
   - quantas pessoas;
   - o que foi feito para conter;
   - o que a pessoa deve fazer (ex.: trocar a senha, desconfiar de e-mails falsos);
   - o contato para dúvidas.
9. Registre o incidente (data, causa, dados afetados, medidas tomadas), mesmo que não precise comunicar.

### Depois
10. Revise o que funcionou e o que faltou, e atualize este plano.

## 5. Rotação de segredos

| Segredo | Como trocar | Efeito |
|---|---|---|
| `JWT_SECRET` | Gerar novo e reiniciar | Todos são deslogados |
| `MERCADOPAGO_ACCESS_TOKEN` / webhook | Renovar no painel do Mercado Pago | Nenhum para o cliente |
| `MELHOR_ENVIO_TOKEN` | Revogar e gerar outro no painel | Nenhum para o cliente |
| Senha do banco | Trocar no Postgres e no `DATABASE_URL` | Reinício do backend |
| `TOTP_ENCRYPTION_KEY` | Exige reconfigurar o 2FA dos admins (os segredos antigos não abrem mais) | Admins refazem o 2FA |
| `ADDRESS_ENCRYPTION_KEY` | Exige migrar: descriptografar com a antiga e criptografar com a nova (formato `v1:` permite versionar) | Sem migração, endereços salvos somem da tela |
