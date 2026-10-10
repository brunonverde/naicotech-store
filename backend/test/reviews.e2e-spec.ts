import { displayName } from '../src/reviews/reviews.service';
import { ShipmentsService } from '../src/shipping/shipments.service';
import { CARD, createTestApp, makeAdmin, orderBody, seedProduct, signUp, signUpAdmin } from './helpers';
import type { TestContext } from './helpers';

describe('Avaliações', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestApp();
  });
  afterEach(async () => {
    await ctx.app.close();
  });

  it('só quem comprou avalia, inclusive depois da entrega, e uma vez por produto', async () => {
    const browser = await signUp(ctx, 'a@teste.com');
    const product = await seedProduct(ctx);
    const review = { productId: product.id, rating: 5, comment: 'Chegou rápido e bem embalada.' };

    await browser.post('/reviews').send(review).expect(403); // ainda não comprou
    const order = await browser.post('/orders').send(orderBody(product.id)).expect(201);
    await browser.post('/reviews').send(review).expect(403); // pedido não pago

    await browser.post(`/orders/${order.body.id}/pay`).send(CARD('approved-1')).expect(201);
    await ctx.app.get(ShipmentsService).markDelivered(order.body.id);
    await browser.post('/reviews').send(review).expect(201);
    await browser.post('/reviews').send(review).expect(409);

    const list = await ctx.http().get(`/reviews/product/${product.id}`).expect(200);
    expect(list.body).toHaveLength(1);
    // Rota pública: só o primeiro nome + inicial do sobrenome.
    expect(list.body[0]).toMatchObject({ rating: 5, user: { name: 'Cliente T.' } });
    expect(list.body[0].user).not.toHaveProperty('email');
  });

  describe('exclusão', () => {
    async function reviewBy(email: string) {
      const browser = await signUp(ctx, email);
      const product = await seedProduct(ctx);
      const order = await browser.post('/orders').send(orderBody(product.id)).expect(201);
      await browser.post(`/orders/${order.body.id}/pay`).send(CARD('approved-1')).expect(201);
      const review = await browser.post('/reviews').send({ productId: product.id, rating: 4 }).expect(201);
      return { browser, id: review.body.id as string };
    }

    it('o autor apaga a própria avaliação; outro cliente não', async () => {
      const { browser, id } = await reviewBy('a@teste.com');
      const other = await signUp(ctx, 'b@teste.com');
      await other.delete(`/reviews/${id}`).expect(403);
      await browser.delete(`/reviews/${id}`).expect(200);
      expect(await ctx.prisma.review.count()).toBe(0);
    });

    it('admin só modera pelo painel, com a 2ª etapa e auditoria', async () => {
      const { id } = await reviewBy('a@teste.com');

      // Sessão comum de admin (sem 2FA): nem pela rota de cliente nem pela do painel.
      const plainAdmin = await signUp(ctx, 'sem2fa@teste.com');
      await makeAdmin(ctx, 'sem2fa@teste.com');
      await plainAdmin.delete(`/reviews/${id}`).expect(403);
      const denied = await plainAdmin.delete(`/admin/reviews/${id}`).expect(403);
      expect(denied.body.code).toBe('ADMIN_2FA_REQUIRED');
      expect(await ctx.prisma.review.count()).toBe(1);

      const { browser: admin } = await signUpAdmin(ctx);
      await admin.delete(`/reviews/${id}`).expect(403);
      await admin.delete(`/admin/reviews/${id}`).expect(200);
      await admin.delete(`/admin/reviews/${id}`).expect(404);
      expect(await ctx.prisma.review.count()).toBe(0);

      const log = await admin.get('/admin/audit-log').expect(200);
      expect(log.body).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'DELETE /admin/reviews/:id', target: id })]));
    });
  });
});

describe('displayName', () => {
  it('reduz o nome para exibição pública', () => {
    expect(displayName('Ana Souza Lima')).toBe('Ana L.');
    expect(displayName('  ana   souza ')).toBe('ana S.');
    expect(displayName('Ana')).toBe('Ana');
  });
});
