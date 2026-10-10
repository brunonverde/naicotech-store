import { JwtService } from '@nestjs/jwt';
import { currentStep, totpCode } from '../src/admin/totp';
import {
  agent,
  CARD,
  loginCookie,
  createTestApp,
  makeAdmin,
  nextTotp,
  orderBody,
  PASSWORD,
  seedProduct,
  signUp,
  signUpAdmin,
} from './helpers';
import type { TestContext } from './helpers';

describe('Painel de admin', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestApp();
  });
  afterEach(async () => {
    await ctx.app.close();
  });

  describe('acesso', () => {
    it('cliente não acessa nada do painel', async () => {
      const customer = await signUp(ctx, 'cliente@teste.com');
      await customer.get('/admin/2fa/status').expect(403);
      await customer.get('/admin/products').expect(403);
      await customer.post('/admin/2fa/setup').send({ password: PASSWORD }).expect(403);
    });

    it('admin sem a 2ª etapa não acessa o painel', async () => {
      const admin = await signUp(ctx, 'admin@teste.com');
      await makeAdmin(ctx, 'admin@teste.com');
      const res = await admin.get('/admin/products').expect(403);
      expect(res.body.code).toBe('ADMIN_2FA_REQUIRED');
      expect((await admin.get('/admin/2fa/status').expect(200)).body.enabled).toBe(false);
    });

    it('com a 2ª etapa, vê produtos com preço de custo', async () => {
      const { browser } = await signUpAdmin(ctx);
      await seedProduct(ctx);
      const res = await browser.get('/admin/products').expect(200);
      expect(res.body[0].costPrice).toBe('3250');
    });
  });

  describe('cadastro do autenticador', () => {
    it('exige a senha e guarda o segredo criptografado', async () => {
      const admin = await signUp(ctx, 'admin@teste.com');
      await makeAdmin(ctx, 'admin@teste.com');
      await admin.post('/admin/2fa/setup').send({ password: 'senhaErrada1' }).expect(401);

      const res = await admin.post('/admin/2fa/setup').send({ password: PASSWORD }).expect(200);
      expect(res.body.otpauthUri).toMatch(/^otpauth:\/\/totp\/NaicoTech%20Store/);
      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'admin@teste.com' } });
      expect(user.totpPendingSecretEnc).toMatch(/^v1:/);
      expect(user.totpPendingSecretEnc).not.toContain(res.body.secret);
    });

    it('código errado não ativa; certo ativa, gera 10 códigos de recuperação e abre a sessão do painel', async () => {
      const admin = await signUp(ctx, 'admin@teste.com');
      await makeAdmin(ctx, 'admin@teste.com');
      const { body } = await admin.post('/admin/2fa/setup').send({ password: PASSWORD });

      await admin.post('/admin/2fa/enable').send({ code: '000000' }).expect(401);
      const res = await admin
        .post('/admin/2fa/enable')
        .send({ code: totpCode(body.secret, currentStep()) })
        .expect(200);

      expect(res.body.recoveryCodes).toHaveLength(10);
      expect(String(res.headers['set-cookie'])).toMatch(/naicotech_admin=.+HttpOnly.+SameSite=Strict/);
      expect(ctx.mail.last('security-alert', 'admin@teste.com')?.subject).toContain('ativada');
      await admin.get('/admin/products').expect(200);

      // Não dá para "cadastrar de novo" por cima de um autenticador ativo.
      await admin.post('/admin/2fa/setup').send({ password: PASSWORD }).expect(409);
    });
  });

  describe('entrada no painel', () => {
    it('o mesmo código não serve duas vezes (replay)', async () => {
      const { secret } = await signUpAdmin(ctx);
      const browser = agent(ctx);
      await browser.post('/auth/login').send({ email: 'admin@teste.com', password: PASSWORD }).expect(200);

      const code = nextTotp(secret);
      await browser.post('/admin/2fa/verify').send({ code }).expect(200);
      await browser.post('/admin/2fa/verify').send({ code }).expect(401);
    });

    it('código de recuperação funciona uma vez e avisa por e-mail', async () => {
      const { recoveryCodes } = await signUpAdmin(ctx);
      const browser = agent(ctx);
      await browser.post('/auth/login').send({ email: 'admin@teste.com', password: PASSWORD }).expect(200);

      const res = await browser.post('/admin/2fa/verify').send({ code: recoveryCodes[0] }).expect(200);
      expect(res.body.recoveryCodesLeft).toBe(9);
      expect(ctx.mail.last('security-alert', 'admin@teste.com')?.subject).toContain('recuperação');
      await browser.post('/admin/2fa/verify').send({ code: recoveryCodes[0] }).expect(401);
    });

    it('5 códigos errados bloqueiam a 2ª etapa da conta e avisam por e-mail', async () => {
      await signUpAdmin(ctx);
      const browser = agent(ctx);
      await browser.post('/auth/login').send({ email: 'admin@teste.com', password: PASSWORD }).expect(200);

      for (let i = 0; i < 5; i++) {
        await browser.post('/admin/2fa/verify').send({ code: '000000' }).expect(401);
      }
      const status = await browser.get('/admin/2fa/status').expect(200);
      expect(status.body.lockedUntil).toBeTruthy();
      expect(ctx.mail.last('security-alert', 'admin@teste.com')?.subject).toContain('bloqueado');
    });

    it('conta bloqueada recusa até o código certo', async () => {
      const { secret } = await signUpAdmin(ctx);
      await ctx.prisma.user.update({
        where: { email: 'admin@teste.com' },
        data: { totpLockedUntil: new Date(Date.now() + 10 * 60 * 1000) },
      });
      const browser = agent(ctx);
      await browser.post('/auth/login').send({ email: 'admin@teste.com', password: PASSWORD }).expect(200);
      const res = await browser.post('/admin/2fa/verify').send({ code: nextTotp(secret) }).expect(423);
      expect(res.body.code).toBe('ADMIN_2FA_LOCKED');
    });
  });

  describe('sessão do painel', () => {
    it('sair da conta invalida a sessão do painel', async () => {
      const { browser, adminCookie } = await signUpAdmin(ctx);
      await browser.post('/auth/logout').expect(200);

      // Mesmo com login novo, o cookie de painel antigo (roubado) não vale mais.
      const session = await loginCookie(ctx, 'admin@teste.com');
      const res = await ctx.http().get('/admin/products').set('Cookie', `${session}; ${adminCookie}`).expect(403);
      expect(res.body.code).toBe('ADMIN_2FA_REQUIRED');
    });

    it('cookie de sessão normal não serve como cookie de painel, e vice-versa', async () => {
      await signUpAdmin(ctx);
      const login = await ctx.http().post('/auth/login').send({ email: 'admin@teste.com', password: PASSWORD });
      const sessionToken = (login.headers['set-cookie']?.[0] ?? '').split(';')[0].split('=')[1];
      await ctx.http()
        .get('/admin/products')
        .set('Cookie', `naicotech_session=${sessionToken}; naicotech_admin=${sessionToken}`)
        .expect(403);

      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'admin@teste.com' } });
      const adminToken = await ctx.app.get(JwtService).signAsync({ sub: user.id, ver: user.tokenVersion, typ: 'admin' });
      await ctx.http().get('/auth/me').set('Cookie', `naicotech_session=${adminToken}`).expect(401);
    });

    it('cookie de painel de outro admin não vale', async () => {
      const { adminCookie: anaAdmin } = await signUpAdmin(ctx, 'ana@teste.com');
      await signUpAdmin(ctx, 'bia@teste.com');
      const biaSession = await loginCookie(ctx, 'bia@teste.com');
      await ctx.http().get('/admin/products').set('Cookie', `${biaSession}; ${anaAdmin}`).expect(403);
    });

    it('sessão do painel expira', async () => {
      await signUpAdmin(ctx);
      const session = await loginCookie(ctx, 'admin@teste.com');
      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'admin@teste.com' } });
      // Assinado com o segredo certo, mas vencido há 10s.
      const signer = new JwtService({ secret: process.env.JWT_SECRET });
      const expired = await signer.signAsync({
        sub: user.id,
        ver: user.tokenVersion,
        typ: 'admin',
        exp: Math.floor(Date.now() / 1000) - 10,
      });
      await ctx.http().get('/admin/products').set('Cookie', `${session}; naicotech_admin=${expired}`).expect(403);
    });

    it('reconfigurar o autenticador exige senha e encerra a sessão do painel', async () => {
      const { browser } = await signUpAdmin(ctx);
      await browser.post('/admin/2fa/reset').send({ password: 'senhaErrada1' }).expect(401);
      await browser.post('/admin/2fa/reset').send({ password: PASSWORD }).expect(200);
      await browser.get('/admin/products').expect(403);
      expect((await browser.get('/admin/2fa/status')).body.enabled).toBe(false);
    });
  });

  describe('pedidos e auditoria', () => {
    it('status do pedido só avança na ordem certa', async () => {
      const { browser: admin } = await signUpAdmin(ctx);
      const customer = await signUp(ctx, 'cliente@teste.com');
      const product = await seedProduct(ctx);
      const order = await customer.post('/orders').send(orderBody(product.id, 1));
      const id = order.body.id as string;

      await admin.patch(`/admin/orders/${id}/status`).send({ status: 'SHIPPED' }).expect(400); // ainda PENDING
      await customer.post(`/orders/${id}/pay`).send(CARD('approved-1')).expect(201);
      await admin.patch(`/admin/orders/${id}/status`).send({ status: 'DELIVERED' }).expect(400); // pulando etapa
      await admin.patch(`/admin/orders/${id}/status`).send({ status: 'SHIPPED' }).expect(200);
      await admin.patch(`/admin/orders/${id}/status`).send({ status: 'DELIVERED' }).expect(200);
      await admin.patch(`/admin/orders/${id}/status`).send({ status: 'CANCELLED' }).expect(400);

      const list = await admin.get('/admin/orders?status=DELIVERED').expect(200);
      expect(list.body[0]).toMatchObject({ id, user: { email: 'cliente@teste.com' } });
      expect(list.body[0].items[0].product.name).toBe(product.name);
    });

    it('não apaga produto que já foi vendido', async () => {
      const { browser: admin } = await signUpAdmin(ctx);
      const customer = await signUp(ctx, 'cliente@teste.com');
      const product = await seedProduct(ctx);
      await customer.post('/orders').send(orderBody(product.id, 1));
      await admin.delete(`/products/${product.id}`).expect(409);
    });

    it('registra as ações do admin sem guardar senhas', async () => {
      const { browser: admin } = await signUpAdmin(ctx);
      const category = await ctx.prisma.category.create({ data: { name: 'GPU', slug: 'gpu' } });
      await admin
        .post('/products')
        .send({ name: 'Produto X', description: 'd', price: 10, condition: 'NEW', stock: 1, categoryId: category.id })
        .expect(201);
      await admin.post('/admin/2fa/recovery-codes').send({ password: PASSWORD }).expect(200);

      const log = await admin.get('/admin/audit-log').expect(200);
      const actions = log.body.map((e: { action: string }) => e.action);
      expect(actions).toEqual(
        expect.arrayContaining(['POST /products', '2FA: ativada', '2FA: novos códigos de recuperação gerados']),
      );
      expect(JSON.stringify(log.body)).not.toContain(PASSWORD);
      const created = log.body.find((e: { action: string }) => e.action === 'POST /products');
      expect(created.details.name).toBe('Produto X');
    });
  });
});
