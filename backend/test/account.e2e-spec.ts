import { AuditService } from '../src/admin/audit.service';
import { decryptIp, maskIp } from '../src/security/ip';
import { CARD, createTestApp, makeAdmin, orderBody, PASSWORD, seedProduct, signUp, signUpAdmin } from './helpers';
import type { TestContext } from './helpers';

describe('Conta e LGPD (exportar e excluir dados)', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestApp();
  });
  afterEach(async () => {
    await ctx.app.close();
  });

  it('cadastro exige aceitar os termos e registra quando', async () => {
    await ctx.http().post('/auth/register').send({ name: 'Ana', email: 'a@teste.com', password: PASSWORD }).expect(400);
    await ctx.http().post('/auth/register').send({ name: 'Ana', email: 'a@teste.com', password: PASSWORD, acceptTerms: false }).expect(400);
    await signUp(ctx, 'a@teste.com');
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'a@teste.com' } });
    expect(user.termsAcceptedAt).not.toBeNull();
  });

  describe('IP (auditoria do painel)', () => {
    it('guarda o IP só criptografado, mostra mascarado e apaga depois de 6 meses', async () => {
      const { browser: admin } = await signUpAdmin(ctx);
      const rows = await ctx.prisma.adminAuditLog.findMany();
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.ipEnc).toMatch(/^v1:/);
        expect(row.ipEnc).not.toMatch(/127\.0\.0\.1|::1|ffff/);
      }
      expect(decryptIp(rows[0].ipEnc!)).toMatch(/127\.0\.0\.1|::1/);

      const log = await admin.get('/admin/audit-log').expect(200);
      expect(JSON.stringify(log.body)).not.toMatch(/ipEnc|127\.0\.0\.1/);
      expect(log.body[0].ip).toMatch(/•••/);

      const audit = ctx.app.get(AuditService);
      expect(await audit.purgeOldIps()).toBe(0);
      await ctx.prisma.adminAuditLog.updateMany({ data: { createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) } });
      expect(await audit.purgeOldIps()).toBe(rows.length);
      expect(await ctx.prisma.adminAuditLog.count({ where: { ipEnc: { not: null } } })).toBe(0);
    });

    it('mascara IPv4 e IPv6', () => {
      expect(maskIp('189.45.10.200')).toBe('189.45.•••.•••');
      expect(maskIp('::ffff:189.45.10.200')).toBe('189.45.•••.•••');
      expect(maskIp('2804:14c:abcd:1::5')).toBe('2804:14c:•••');
    });
  });

  describe('exportação', () => {
    it('exige login e a senha de novo', async () => {
      await ctx.http().post('/account/export').send({ password: PASSWORD }).expect(401);
      const browser = await signUp(ctx, 'a@teste.com');
      await browser.post('/account/export').send({ password: 'senhaErrada1' }).expect(401);
    });

    it('devolve conta, endereços e pedidos completos, sem cache e sem a senha', async () => {
      const browser = await signUp(ctx, 'a@teste.com', 'Ana Souza');
      const product = await seedProduct(ctx);
      await browser.post('/orders').send(orderBody(product.id, 1, { saveAddress: true })).expect(201);

      const res = await browser.post('/account/export').send({ password: PASSWORD }).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.account).toMatchObject({ name: 'Ana Souza', email: 'a@teste.com' });
      expect(res.body.savedAddresses[0]).toMatchObject({ street: 'Avenida Atlântica', document: '52998224725' });
      expect(res.body.orders[0]).toMatchObject({ status: 'PENDING', deliveryAddress: { number: '1702' } });
      expect(res.body.orders[0].items[0].product).toBe(product.name);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2b\$|totp/i);
    });

    it('só exporta os próprios dados', async () => {
      const ana = await signUp(ctx, 'ana@teste.com');
      const product = await seedProduct(ctx);
      await ana.post('/orders').send(orderBody(product.id, 1, { saveAddress: true })).expect(201);
      const bia = await signUp(ctx, 'bia@teste.com');

      const res = await bia.post('/account/export').send({ password: PASSWORD }).expect(200);
      expect(res.body.orders).toEqual([]);
      expect(res.body.savedAddresses).toEqual([]);
    });
  });

  describe('exclusão', () => {
    it('apaga os dados pessoais, mantém pedidos anônimos e encerra a sessão', async () => {
      const browser = await signUp(ctx, 'a@teste.com', 'Ana Souza');
      const product = await seedProduct(ctx, { stock: 5 });
      const order = await browser.post('/orders').send(orderBody(product.id, 2, { saveAddress: true })).expect(201);
      const { id: userId } = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'a@teste.com' } });

      await browser.post('/account/delete').send({ password: PASSWORD }).expect(400); // sem "EXCLUIR"
      await browser.post('/account/delete').send({ password: 'senhaErrada1', confirm: 'EXCLUIR' }).expect(401);
      await browser.post('/account/delete').send({ password: PASSWORD, confirm: 'EXCLUIR' }).expect(200);

      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user).toMatchObject({ name: 'Conta excluída', emailVerifiedAt: null });
      expect(user.email).not.toContain('a@teste.com');
      expect(user.deletedAt).not.toBeNull();
      expect(await ctx.prisma.address.count()).toBe(0);
      expect(await ctx.prisma.orderAddress.count()).toBe(0);

      // Pedido não pago foi cancelado e o estoque voltou; o registro do pedido continua.
      const kept = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.body.id } });
      expect(kept).toMatchObject({ status: 'CANCELLED', shippingSummary: null });
      expect((await ctx.prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(5);

      // Sessão encerrada, login antigo não funciona, e-mail de confirmação enviado.
      await browser.get('/auth/me').expect(401);
      await ctx.http().post('/auth/login').send({ email: 'a@teste.com', password: PASSWORD }).expect(401);
      expect(ctx.mail.last('account-deleted', 'a@teste.com')).toBeDefined();

      // O e-mail fica livre para uma conta nova.
      await signUp(ctx, 'a@teste.com');
    });

    it('não exclui com pedido pago em andamento', async () => {
      const browser = await signUp(ctx, 'a@teste.com');
      const product = await seedProduct(ctx);
      const order = await browser.post('/orders').send(orderBody(product.id)).expect(201);
      await browser.post(`/orders/${order.body.id}/pay`).send(CARD('approved-1')).expect(201);

      await browser.post('/account/delete').send({ password: PASSWORD, confirm: 'EXCLUIR' }).expect(409);
      expect((await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'a@teste.com' } })).deletedAt).toBeNull();
    });

    it('admin não se exclui pelo site', async () => {
      const browser = await signUp(ctx, 'admin@teste.com');
      await makeAdmin(ctx, 'admin@teste.com');
      await browser.post('/account/delete').send({ password: PASSWORD, confirm: 'EXCLUIR' }).expect(403);
    });
  });
});
