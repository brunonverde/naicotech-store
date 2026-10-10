import { ShipmentsService } from '../src/shipping/shipments.service';
import { CARD, createTestApp, orderBody, seedProduct, signUp } from './helpers';
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
    expect(list.body[0]).toMatchObject({ rating: 5, user: { name: 'Cliente Teste' } });
    expect(list.body[0].user).not.toHaveProperty('email');
  });
});
