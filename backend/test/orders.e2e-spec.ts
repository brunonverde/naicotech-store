import { OrdersService } from '../src/orders/orders.service';
import { CARD, createTestApp, orderBody, seedProduct, signUp, signWebhook } from './helpers';
import type { TestContext } from './helpers';

describe('Pedidos e pagamentos', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestApp();
  });
  afterEach(async () => {
    await ctx.app.close();
  });

  const stockOf = async (id: string) =>
    (await ctx.prisma.product.findUniqueOrThrow({ where: { id } })).stock;

  describe('criação', () => {
    it('exige login', async () => {
      const product = await seedProduct(ctx);
      await ctx.http().post('/orders').send(orderBody(product.id, 1)).expect(401);
    });

    it('calcula o total com o preço do banco e baixa o estoque', async () => {
      const browser = await signUp(ctx, 'a@teste.com');
      const product = await seedProduct(ctx, { stock: 5, price: '100.50' });

      const res = await browser
        .post('/orders')
        .send(orderBody(product.id, 2))
        .expect(201);
      // 2 × 100,50 + PAC 30,00 (preço e frete do servidor).
      expect(res.body.totalAmount).toBe('231');
      expect(res.body.shippingPrice).toBe('30');
      expect(res.body.items).toHaveLength(1);
      expect(await stockOf(product.id)).toBe(3);
    });

    it('ignora preço enviado pelo cliente (campo extra é rejeitado)', async () => {
      const browser = await signUp(ctx, 'a@teste.com');
      const product = await seedProduct(ctx);
      await browser
        .post('/orders')
        .send(orderBody(product.id, 1, { items: [{ productId: product.id, quantity: 1, price: 0.01 }] }))
        .expect(400);
    });

    it('recusa estoque insuficiente sem baixar nada', async () => {
      const browser = await signUp(ctx, 'a@teste.com');
      const product = await seedProduct(ctx, { stock: 1 });
      await browser.post('/orders').send(orderBody(product.id, 2)).expect(409);
      expect(await stockOf(product.id)).toBe(1);
    });

    it('limita a 3 pedidos pendentes por pessoa', async () => {
      const browser = await signUp(ctx, 'a@teste.com');
      const product = await seedProduct(ctx, { stock: 10 });
      for (let i = 0; i < 3; i++) {
        await browser.post('/orders').send(orderBody(product.id, 1)).expect(201);
      }
      await browser.post('/orders').send(orderBody(product.id, 1)).expect(409);
    });

    it('não deixa ver pedido de outra pessoa (404)', async () => {
      const ana = await signUp(ctx, 'ana@teste.com');
      const bia = await signUp(ctx, 'bia@teste.com');
      const product = await seedProduct(ctx);
      const order = await ana.post('/orders').send(orderBody(product.id, 1));

      await bia.get(`/orders/${order.body.id}`).expect(404);
      await bia.post(`/orders/${order.body.id}/pay`).send(CARD('approved-1')).expect(404);
      expect((await bia.get('/orders')).body).toHaveLength(0);
    });
  });

  describe('pagamento', () => {
    async function pendingOrder() {
      const browser = await signUp(ctx, 'a@teste.com');
      const product = await seedProduct(ctx, { stock: 5 });
      const order = await browser.post('/orders').send(orderBody(product.id, 1));
      return { browser, product, orderId: order.body.id as string };
    }

    it('aprovado: pedido PAID, resposta com itens, valor do banco (produto + frete) enviado ao Mercado Pago', async () => {
      const { browser, orderId } = await pendingOrder();
      const res = await browser.post(`/orders/${orderId}/pay`).send(CARD('approved-1')).expect(201);
      expect(res.body.status).toBe('PAID');
      expect(res.body.items).toHaveLength(1); // o bug da tela preta
      expect(ctx.payments.calls[0]).toMatchObject({ amount: '3829.90', payerEmail: 'a@teste.com' });
      await browser.post(`/orders/${orderId}/pay`).send(CARD('approved-2')).expect(400);
    });

    it('recusado: pedido continua PENDING e liberado para outra tentativa', async () => {
      const { browser, orderId } = await pendingOrder();
      await browser.post(`/orders/${orderId}/pay`).send(CARD('rejected-1')).expect(400);
      const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order).toMatchObject({ status: 'PENDING', paymentId: null });

      await browser.post(`/orders/${orderId}/pay`).send(CARD('approved-2')).expect(201);
    });

    it('dois pagamentos simultâneos: só um chega ao Mercado Pago', async () => {
      const { browser, orderId } = await pendingOrder();
      const [a, b] = await Promise.all([
        browser.post(`/orders/${orderId}/pay`).send(CARD('slow-approved-1')),
        browser.post(`/orders/${orderId}/pay`).send(CARD('slow-approved-2')),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect(ctx.payments.calls).toHaveLength(1);
    });

    it('resultado incerto (timeout): mantém a trava para não cobrar duas vezes', async () => {
      const { browser, orderId } = await pendingOrder();
      await browser.post(`/orders/${orderId}/pay`).send(CARD('timeout-cartao-1')).expect(503);
      await browser.post(`/orders/${orderId}/pay`).send(CARD('approved-2')).expect(409);
      expect(ctx.payments.calls).toHaveLength(1);
    });

    it('recusa pagamento de pedido expirado', async () => {
      const { browser, orderId } = await pendingOrder();
      await ctx.prisma.order.update({
        where: { id: orderId },
        data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) },
      });
      await browser.post(`/orders/${orderId}/pay`).send(CARD('approved-1')).expect(409);
      expect(ctx.payments.calls).toHaveLength(0);
    });

    it('valida os dados do cartão', async () => {
      const { browser, orderId } = await pendingOrder();
      await browser
        .post(`/orders/${orderId}/pay`)
        .send({ ...CARD('approved-1'), paymentType: 'pix', installments: 99 })
        .expect(400);
    });
  });

  describe('expiração de pedidos não pagos', () => {
    it('cancela pedido sem pagamento após 30 min e devolve o estoque', async () => {
      const browser = await signUp(ctx, 'a@teste.com');
      const product = await seedProduct(ctx, { stock: 3 });
      const order = await browser.post('/orders').send(orderBody(product.id, 2));
      expect(await stockOf(product.id)).toBe(1);

      await ctx.prisma.order.update({
        where: { id: order.body.id },
        data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) },
      });
      await ctx.app.get(OrdersService).expireUnpaidOrders();

      expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.body.id } })).status).toBe('CANCELLED');
      expect(await stockOf(product.id)).toBe(3);
    });

    it('não mexe em pedido recente nem em pedido com pagamento em andamento', async () => {
      const browser = await signUp(ctx, 'a@teste.com');
      const product = await seedProduct(ctx, { stock: 5 });
      const recent = await browser.post('/orders').send(orderBody(product.id, 1));
      const paying = await browser.post('/orders').send(orderBody(product.id, 1));
      await ctx.prisma.order.update({
        where: { id: paying.body.id },
        data: { paymentId: 'PROCESSING', createdAt: new Date(Date.now() - 31 * 60 * 1000) },
      });

      await ctx.app.get(OrdersService).expireUnpaidOrders();
      const statuses = await ctx.prisma.order.findMany({ select: { id: true, status: true } });
      expect(statuses.every((o) => o.status === 'PENDING')).toBe(true);
      expect(recent.body.id).toBeDefined();
    });
  });

  describe('webhook do Mercado Pago', () => {
    async function orderInAnalysis() {
      const browser = await signUp(ctx, 'a@teste.com');
      const product = await seedProduct(ctx);
      const order = await browser.post('/orders').send(orderBody(product.id, 1));
      const paid = await browser.post(`/orders/${order.body.id}/pay`).send(CARD('pending-cartao-1')).expect(201);
      return { orderId: order.body.id as string, mpOrderId: paid.body.paymentId as string };
    }

    const notify = (mpOrderId: string, headers: Record<string, string>) =>
      ctx.http().post(`/payments/webhook?type=order&data.id=${mpOrderId}`).set(headers).send({});

    it('ignora assinatura inválida (e sempre responde 200)', async () => {
      const { orderId, mpOrderId } = await orderInAnalysis();
      ctx.payments.mpOrders.set(mpOrderId, {
        ...ctx.payments.mpOrders.get(mpOrderId),
        status: 'processed',
        transactions: { payments: [{ status_detail: 'accredited' }] },
      });
      await notify(mpOrderId, { 'x-signature': 'ts=1,v1=abc', 'x-request-id': 'x' }).expect(200);
      expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PENDING');
    });

    it('ignora assinatura antiga (replay)', async () => {
      const { orderId, mpOrderId } = await orderInAnalysis();
      ctx.payments.mpOrders.set(mpOrderId, {
        ...ctx.payments.mpOrders.get(mpOrderId),
        status: 'processed',
        transactions: { payments: [{ status_detail: 'accredited' }] },
      });
      const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
      await notify(mpOrderId, signWebhook(mpOrderId, 'req-1', oneHourAgo)).expect(200);
      expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PENDING');
    });

    it('aprova o pedido quando o Mercado Pago confirma', async () => {
      const { orderId, mpOrderId } = await orderInAnalysis();
      ctx.payments.mpOrders.set(mpOrderId, {
        ...ctx.payments.mpOrders.get(mpOrderId),
        status: 'processed',
        transactions: { payments: [{ status_detail: 'accredited' }] },
      });
      await notify(mpOrderId, signWebhook(mpOrderId)).expect(200);
      expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PAID');
    });

    it('não aprova se o valor pago for diferente do total do pedido', async () => {
      const { orderId, mpOrderId } = await orderInAnalysis();
      ctx.payments.mpOrders.set(mpOrderId, {
        ...ctx.payments.mpOrders.get(mpOrderId),
        status: 'processed',
        total_amount: '1.00',
        transactions: { payments: [{ status_detail: 'accredited' }] },
      });
      await notify(mpOrderId, signWebhook(mpOrderId)).expect(200);
      expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PENDING');
    });

    it('recusa posterior libera o pedido para nova tentativa', async () => {
      const { orderId, mpOrderId } = await orderInAnalysis();
      ctx.payments.mpOrders.set(mpOrderId, { ...ctx.payments.mpOrders.get(mpOrderId), status: 'failed' });
      await notify(mpOrderId, signWebhook(mpOrderId)).expect(200);
      expect(await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({
        status: 'PENDING',
        paymentId: null,
      });
    });

    it('estorno cancela o pedido pago', async () => {
      const { orderId, mpOrderId } = await orderInAnalysis();
      await ctx.prisma.order.update({ where: { id: orderId }, data: { status: 'PAID' } });
      ctx.payments.mpOrders.set(mpOrderId, { ...ctx.payments.mpOrders.get(mpOrderId), status: 'refunded' });
      await notify(mpOrderId, signWebhook(mpOrderId)).expect(200);
      expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('CANCELLED');
    });
  });
});
