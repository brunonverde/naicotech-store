import { createTestApp, makeAdmin, orderBody, ORIGIN, PASSWORD, seedProduct, signUp, signUpAdmin } from './helpers';
import type { TestContext } from './helpers';

describe('Proteções gerais', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestApp();
  });
  afterEach(async () => {
    await ctx.app.close();
  });

  describe('CSRF', () => {
    it('recusa requisição de outra origem', async () => {
      const browser = await signUp(ctx, 'a@teste.com');
      const product = await seedProduct(ctx);
      await browser
        .post('/orders')
        .set('Origin', 'https://site-malicioso.com')
        .send(orderBody(product.id, 1))
        .expect(403);
    });

    it('aceita a origem do front', async () => {
      const browser = await signUp(ctx, 'a@teste.com');
      const product = await seedProduct(ctx);
      await browser
        .post('/orders')
        .set('Origin', ORIGIN)
        .send(orderBody(product.id, 1))
        .expect(201);
    });

    it('recusa corpo que não é JSON (formulário HTML de outro site)', async () => {
      const browser = await signUp(ctx, 'a@teste.com');
      await browser
        .post('/orders')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('items=1')
        .expect(415);
    });

    it('CORS só libera a origem do front', async () => {
      const allowed = await ctx.http().options('/orders').set('Origin', ORIGIN).set('Access-Control-Request-Method', 'POST');
      const blocked = await ctx.http().options('/orders').set('Origin', 'https://site-malicioso.com').set('Access-Control-Request-Method', 'POST');
      expect(allowed.headers['access-control-allow-origin']).toBe(ORIGIN);
      expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('rate limit', () => {
    it('bloqueia força bruta no login', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        const res = await ctx.http().post('/auth/login').send({ email: 'x@teste.com', password: `errada${i}aa` });
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
      expect(statuses[5]).toBe(429);
    });

    it('limita cadastros em sequência', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) {
        const res = await ctx.http().post('/auth/register').send({ name: 'Bot', email: `bot${i}@teste.com`, password: PASSWORD });
        statuses.push(res.status);
      }
      expect(statuses).toEqual([201, 201, 201, 429]);
    });
  });

  describe('entrada e headers', () => {
    it('envia headers de segurança e esconde o framework', async () => {
      const res = await ctx.http().get('/products').expect(200);
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(res.headers['strict-transport-security']).toBeDefined();
    });

    it('recusa corpo grande demais', async () => {
      await ctx.http()
        .post('/auth/login')
        .send({ email: 'a@teste.com', password: 'x'.repeat(30_000) })
        .expect(413);
    });

    it('recusa campos desconhecidos (ex.: tentar virar admin no cadastro)', async () => {
      await ctx.http()
        .post('/auth/register')
        .send({ name: 'Ana', email: 'a@teste.com', password: PASSWORD, role: 'ADMIN' })
        .expect(400);
    });

    it('recusa IDs malformados', async () => {
      await ctx.http().get('/products/1%20OR%201=1').expect(400);
    });
  });

  describe('produtos', () => {
    it('nunca expõe o preço de custo publicamente', async () => {
      const product = await seedProduct(ctx);
      const list = await ctx.http().get('/products').expect(200);
      const one = await ctx.http().get(`/products/${product.id}`).expect(200);
      expect(JSON.stringify(list.body)).not.toContain('costPrice');
      expect(JSON.stringify(one.body)).not.toContain('costPrice');
    });

    it('só admin com verificação em duas etapas cria produto', async () => {
      const category = await ctx.prisma.category.create({ data: { name: 'GPU', slug: 'gpu' } });
      const body = {
        name: 'Produto',
        description: 'desc',
        price: 10,
        condition: 'NEW',
        stock: 1,
        categoryId: category.id,
      };
      await ctx.http().post('/products').send(body).expect(401);

      const customer = await signUp(ctx, 'cliente@teste.com');
      await customer.post('/products').send(body).expect(403);

      // Admin sem a 2ª etapa: barrado.
      const adminNo2fa = await signUp(ctx, 'semtotp@teste.com');
      await makeAdmin(ctx, 'semtotp@teste.com');
      const denied = await adminNo2fa.post('/products').send(body).expect(403);
      expect(denied.body.code).toBe('ADMIN_2FA_REQUIRED');

      const { browser: admin } = await signUpAdmin(ctx);
      await admin.post('/products').send(body).expect(201);
    });

    it('imagens de produto só com https', async () => {
      const category = await ctx.prisma.category.create({ data: { name: 'GPU', slug: 'gpu' } });
      const { browser: admin } = await signUpAdmin(ctx);
      const base = { name: 'Produto', description: 'd', price: 10, condition: 'NEW', stock: 1, categoryId: category.id };

      for (const url of ['javascript:alert(1)', 'http://exemplo.com/a.jpg', 'data:image/png;base64,AAAA']) {
        await admin.post('/products').send({ ...base, images: [url] }).expect(400);
      }
      await admin.post('/products').send({ ...base, images: ['https://exemplo.com/a.jpg'] }).expect(201);
    });
  });
});
