import { Logger } from '@nestjs/common';
import { CARD, createTestApp, orderBody, PASSWORD, seedProduct, signUp } from './helpers';
import type { TestContext } from './helpers';

const EMAIL = 'cliente@teste.com';

describe('Autenticação', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestApp();
  });
  afterEach(async () => {
    await ctx.app.close();
  });

  describe('cadastro e confirmação de e-mail', () => {
    it('não revela se o e-mail já existe e avisa o dono por e-mail', async () => {
      const first = await ctx.http().post('/auth/register').send({ name: 'Ana', email: EMAIL, password: PASSWORD, acceptTerms: true });
      expect(first.status).toBe(201);

      // Confirma a conta e tenta cadastrar de novo.
      const token = ctx.mail.tokenFrom('verification', EMAIL);
      await ctx.http().post('/auth/verify-email').send({ token }).expect(200);
      const second = await ctx.http().post('/auth/register').send({ name: 'Outro', email: EMAIL, password: 'outraSenha1', acceptTerms: true });

      expect(second.status).toBe(201);
      expect(second.body).toEqual(first.body);
      expect(ctx.mail.last('account-exists', EMAIL)).toBeDefined();
      // A senha da conta existente não muda.
      await ctx.http().post('/auth/login').send({ email: EMAIL, password: PASSWORD }).expect(200);
    });

    it('não devolve dados sensíveis no cadastro', async () => {
      const res = await ctx.http().post('/auth/register').send({ name: 'Ana', email: EMAIL, password: PASSWORD, acceptTerms: true });
      const body = JSON.stringify(res.body);
      expect(body).not.toMatch(/passwordHash|verificationToken|tokenVersion/);
    });

    it('guarda só o hash do token de confirmação no banco', async () => {
      await ctx.http().post('/auth/register').send({ name: 'Ana', email: EMAIL, password: PASSWORD, acceptTerms: true });
      const token = ctx.mail.tokenFrom('verification', EMAIL);
      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
      expect(user.verificationTokenHash).toBeTruthy();
      expect(user.verificationTokenHash).not.toBe(token);
      expect(user.passwordHash).not.toContain(PASSWORD);
    });

    it('bloqueia login até confirmar o e-mail', async () => {
      await ctx.http().post('/auth/register').send({ name: 'Ana', email: EMAIL, password: PASSWORD, acceptTerms: true });
      const res = await ctx.http().post('/auth/login').send({ email: EMAIL, password: PASSWORD });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('confirma o e-mail, abre a sessão em cookie httpOnly e o link só vale uma vez', async () => {
      await ctx.http().post('/auth/register').send({ name: 'Ana', email: EMAIL, password: PASSWORD, acceptTerms: true });
      const token = ctx.mail.tokenFrom('verification', EMAIL);

      const res = await ctx.http().post('/auth/verify-email').send({ token }).expect(200);
      const cookie = res.headers['set-cookie']?.[0] ?? '';
      expect(cookie).toMatch(/^naicotech_session=/);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(res.body.user).toMatchObject({ email: EMAIL, role: 'CUSTOMER' });
      expect(JSON.stringify(res.body)).not.toMatch(/eyJ/); // nenhum JWT no corpo

      await ctx.http().post('/auth/verify-email').send({ token }).expect(400);
    });

    it('recusa link de confirmação expirado', async () => {
      await ctx.http().post('/auth/register').send({ name: 'Ana', email: EMAIL, password: PASSWORD, acceptTerms: true });
      const token = ctx.mail.tokenFrom('verification', EMAIL);
      await ctx.prisma.user.update({
        where: { email: EMAIL },
        data: { verificationTokenExpires: new Date(Date.now() - 1000) },
      });
      await ctx.http().post('/auth/verify-email').send({ token }).expect(400);
    });

    it('reenvio responde igual para e-mail existente e inexistente', async () => {
      await ctx.http().post('/auth/register').send({ name: 'Ana', email: EMAIL, password: PASSWORD, acceptTerms: true });
      const a = await ctx.http().post('/auth/resend-verification').send({ email: EMAIL });
      const b = await ctx.http().post('/auth/resend-verification').send({ email: 'ninguem@teste.com' });
      expect(a.body).toEqual(b.body);
    });
  });

  describe('login e sessão', () => {
    it('mesma mensagem para senha errada e e-mail inexistente', async () => {
      await signUp(ctx, EMAIL);
      const wrongPassword = await ctx.http().post('/auth/login').send({ email: EMAIL, password: 'senhaErrada1' });
      const unknownEmail = await ctx.http().post('/auth/login').send({ email: 'ninguem@teste.com', password: PASSWORD });
      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    });

    it('/auth/me exige sessão e devolve o usuário', async () => {
      await ctx.http().get('/auth/me').expect(401);
      const browser = await signUp(ctx, EMAIL, 'Ana Souza');
      const me = await browser.get('/auth/me').expect(200);
      expect(me.body).toMatchObject({ email: EMAIL, name: 'Ana Souza', role: 'CUSTOMER' });
    });

    it('recusa cookie com JWT adulterado', async () => {
      await ctx.http()
        .get('/auth/me')
        .set('Cookie', 'naicotech_session=eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4IiwidmVyIjowfQ.')
        .expect(401);
    });

    it('sair invalida a sessão no servidor, não só no navegador', async () => {
      await ctx.http().post('/auth/register').send({ name: 'Ana', email: EMAIL, password: PASSWORD, acceptTerms: true });
      const token = ctx.mail.tokenFrom('verification', EMAIL);
      const verified = await ctx.http().post('/auth/verify-email').send({ token }).expect(200);
      // Cookie "roubado": uma cópia guardada antes do logout.
      const stolenCookie = (verified.headers['set-cookie']?.[0] ?? '').split(';')[0];

      await ctx.http().get('/auth/me').set('Cookie', stolenCookie).expect(200);
      await ctx.http().post('/auth/logout').set('Cookie', stolenCookie).expect(200);
      await ctx.http().get('/auth/me').set('Cookie', stolenCookie).expect(401);
    });

    it('papel é lido do banco a cada requisição (rebaixar admin vale na hora)', async () => {
      const browser = await signUp(ctx, EMAIL);
      await ctx.prisma.user.update({ where: { email: EMAIL }, data: { role: 'ADMIN' } });
      expect((await browser.get('/auth/me')).body.role).toBe('ADMIN');
      await ctx.prisma.user.update({ where: { email: EMAIL }, data: { role: 'CUSTOMER' } });
      expect((await browser.get('/auth/me')).body.role).toBe('CUSTOMER');
    });
  });

  describe('recuperação de senha', () => {
    it('resposta igual para e-mail existente e inexistente', async () => {
      await signUp(ctx, EMAIL);
      const a = await ctx.http().post('/auth/forgot-password').send({ email: EMAIL });
      const b = await ctx.http().post('/auth/forgot-password').send({ email: 'ninguem@teste.com' });
      expect(a.status).toBe(200);
      expect(a.body).toEqual(b.body);
      expect(ctx.mail.last('password-reset', EMAIL)).toBeDefined();
      expect(ctx.mail.last('password-reset', 'ninguem@teste.com')).toBeUndefined();
    });

    it('troca a senha, derruba as sessões antigas, avisa por e-mail e entra', async () => {
      const oldBrowser = await signUp(ctx, EMAIL);
      await ctx.http().post('/auth/forgot-password').send({ email: EMAIL });
      const token = ctx.mail.tokenFrom('password-reset', EMAIL);

      const res = await ctx.http()
        .post('/auth/reset-password')
        .send({ token, password: 'novaSenha456' })
        .expect(200);
      expect(res.headers['set-cookie']?.[0]).toMatch(/naicotech_session=.+HttpOnly/);
      expect(ctx.mail.last('password-changed', EMAIL)).toBeDefined();

      await oldBrowser.get('/auth/me').expect(401);
      await ctx.http().post('/auth/login').send({ email: EMAIL, password: PASSWORD }).expect(401);
      await ctx.http().post('/auth/login').send({ email: EMAIL, password: 'novaSenha456' }).expect(200);
      // Link de uso único.
      await ctx.http().post('/auth/reset-password').send({ token, password: 'outraSenha789' }).expect(400);
    });

    it('recusa link expirado e senha fraca', async () => {
      await signUp(ctx, EMAIL);
      await ctx.http().post('/auth/forgot-password').send({ email: EMAIL });
      const token = ctx.mail.tokenFrom('password-reset', EMAIL);

      await ctx.http().post('/auth/reset-password').send({ token, password: '123' }).expect(400);
      await ctx.prisma.user.update({
        where: { email: EMAIL },
        data: { passwordResetExpires: new Date(Date.now() - 1000) },
      });
      await ctx.http().post('/auth/reset-password').send({ token, password: 'novaSenha456' }).expect(400);
    });

    it('redefinir a senha também confirma o e-mail de conta pendente', async () => {
      await ctx.http().post('/auth/register').send({ name: 'Ana', email: EMAIL, password: PASSWORD, acceptTerms: true });
      await ctx.http().post('/auth/forgot-password').send({ email: EMAIL });
      const token = ctx.mail.tokenFrom('password-reset', EMAIL);
      await ctx.http().post('/auth/reset-password').send({ token, password: 'novaSenha456' }).expect(200);
      await ctx.http().post('/auth/login').send({ email: EMAIL, password: 'novaSenha456' }).expect(200);
    });
  });

  it('pagamento usa o e-mail da sessão, nunca um enviado pelo cliente', async () => {
    const browser = await signUp(ctx, EMAIL);
    const product = await seedProduct(ctx);
    const order = await browser.post('/orders').send(orderBody(product.id, 1));
    await browser
      .post(`/orders/${order.body.id}/pay`)
      .send({ ...CARD('approved-1'), payerEmail: 'atacante@x.com' })
      .expect(400); // campo extra é rejeitado
    expect(ctx.payments.calls).toHaveLength(0);
  });

  it('falha no envio de e-mail não grava o endereço completo no log', async () => {
    await signUp(ctx, EMAIL);
    ctx.mail.sendPasswordReset = async () => {
      throw new Error('SMTP fora do ar');
    };
    const errors = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      await ctx.http().post('/auth/forgot-password').send({ email: EMAIL }).expect(200);
      await vi.waitFor(() => expect(errors).toHaveBeenCalled());
      const logged = errors.mock.calls.map((call) => String(call[0])).join('\n');
      expect(logged).toContain('c•••@teste.com');
      expect(logged).not.toContain(EMAIL);
    } finally {
      errors.mockRestore();
    }
  });
});
