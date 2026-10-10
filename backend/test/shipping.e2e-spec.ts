import { OrdersService } from '../src/orders/orders.service';
import { insuredValue } from '../src/shipping/melhor-envio.client';
import { ShipmentsService } from '../src/shipping/shipments.service';
import {
  ADDRESS,
  CARD,
  createTestApp,
  orderBody,
  SEDEX,
  seedProduct,
  signUp,
  signUpAdmin,
} from './helpers';
import type { TestContext } from './helpers';

describe('Frete, endereços e envio', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestApp();
  });
  afterEach(async () => {
    await ctx.app.close();
  });

  describe('cotação', () => {
    it('é pública, usa peso/medidas do banco e esconde serviços que não atendem', async () => {
      const product = await seedProduct(ctx);
      await ctx.prisma.product.update({
        where: { id: product.id },
        data: { weightGrams: 1500, lengthCm: 32, widthCm: 22, heightCm: 12 },
      });

      const res = await ctx
        .http()
        .post('/shipping/quote')
        .send({ postalCode: '22041-001', items: [{ productId: product.id, quantity: 2 }] })
        .expect(200);

      expect(res.body.map((o: { name: string }) => o.name)).toEqual(['PAC', 'SEDEX']); // mais barato primeiro
      expect(res.body[0]).toMatchObject({ serviceId: 1, price: '30.00', company: 'Correios', deliveryDays: 7 });
      expect(ctx.melhorEnvio.quotes[0]).toMatchObject({
        postalCode: '22041001',
        items: [{ quantity: 2, weightGrams: 1500, lengthCm: 32, unitPrice: 3799.9 }],
      });
    });

    it('valida o CEP e não aceita campos extras (peso vindo do navegador)', async () => {
      const product = await seedProduct(ctx);
      await ctx.http().post('/shipping/quote').send({ postalCode: '123', items: [{ productId: product.id, quantity: 1 }] }).expect(400);
      await ctx
        .http()
        .post('/shipping/quote')
        .send({ postalCode: '22041001', items: [{ productId: product.id, quantity: 1, weightGrams: 1 }] })
        .expect(400);
    });

    it('CEP sem cobertura devolve lista vazia', async () => {
      const product = await seedProduct(ctx);
      const res = await ctx.http().post('/shipping/quote').send({ postalCode: '01000000', items: [{ productId: product.id, quantity: 1 }] }).expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('pedido com frete', () => {
    it('recota no servidor e soma o frete escolhido ao total', async () => {
      const browser = await signUp(ctx, 'a@teste.com');
      const product = await seedProduct(ctx, { price: '100.00' });
      const res = await browser.post('/orders').send(orderBody(product.id, 1, { shippingServiceId: SEDEX })).expect(201);

      expect(res.body).toMatchObject({
        totalAmount: '155.5',
        shippingPrice: '55.5',
        shippingServiceName: 'SEDEX',
        shippingCompany: 'Correios',
        shippingSummary: 'Rio de Janeiro/RJ · CEP 22041-•••',
      });
      // Nada de endereço completo nem ID interno da etiqueta na resposta.
      const json = JSON.stringify(res.body);
      expect(json).not.toContain('Atlântica');
      expect(json).not.toContain('52998224725');
      expect(res.body).not.toHaveProperty('shipmentId');
    });

    it('recusa frete inexistente ou que não atende o CEP', async () => {
      const browser = await signUp(ctx, 'a@teste.com');
      const product = await seedProduct(ctx);
      await browser.post('/orders').send(orderBody(product.id, 1, { shippingServiceId: 3 })).expect(400);
      await browser.post('/orders').send(orderBody(product.id, 1, { shippingServiceId: 999 })).expect(400);
      expect((await ctx.prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(5);
    });

    it('não aceita preço de frete enviado pelo cliente', async () => {
      const browser = await signUp(ctx, 'a@teste.com');
      const product = await seedProduct(ctx);
      await browser.post('/orders').send(orderBody(product.id, 1, { shippingPrice: 0 })).expect(400);
    });

    it('valida o endereço (CPF, UF, sem HTML) e exige um endereço', async () => {
      const browser = await signUp(ctx, 'a@teste.com');
      const product = await seedProduct(ctx);
      const bad = (patch: Record<string, string>) => orderBody(product.id, 1, { address: { ...ADDRESS, ...patch } });

      await browser.post('/orders').send(bad({ document: '111.111.111-11' })).expect(400);
      await browser.post('/orders').send(bad({ document: '529.982.247-24' })).expect(400);
      await browser.post('/orders').send(bad({ state: 'XX' })).expect(400);
      await browser.post('/orders').send(bad({ street: '<script>alert(1)</script>' })).expect(400);
      await browser.post('/orders').send({ items: [{ productId: product.id, quantity: 1 }], shippingServiceId: 1 }).expect(400);
    });

    it('guarda o endereço do pedido criptografado, em tabela separada', async () => {
      const browser = await signUp(ctx, 'a@teste.com');
      const product = await seedProduct(ctx);
      const order = await browser.post('/orders').send(orderBody(product.id)).expect(201);

      const row = await ctx.prisma.orderAddress.findUniqueOrThrow({ where: { orderId: order.body.id } });
      expect(row.dataEnc).toMatch(/^v1:/);
      expect(row.dataEnc).not.toContain('Atlântica');
      expect(await ctx.prisma.address.count()).toBe(0); // sem consentimento, não salva
    });

    it('pedido expirado sem pagamento apaga o endereço', async () => {
      const browser = await signUp(ctx, 'a@teste.com');
      const product = await seedProduct(ctx);
      const order = await browser.post('/orders').send(orderBody(product.id)).expect(201);
      await ctx.prisma.order.update({ where: { id: order.body.id }, data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) } });

      await ctx.app.get(OrdersService).expireUnpaidOrders();
      expect(await ctx.prisma.orderAddress.count()).toBe(0);
    });
  });

  describe('endereços salvos', () => {
    async function withSavedAddress(email = 'a@teste.com') {
      const browser = await signUp(ctx, email);
      const product = await seedProduct(ctx);
      await browser.post('/orders').send(orderBody(product.id, 1, { saveAddress: true })).expect(201);
      const [saved] = (await browser.get('/addresses').expect(200)).body;
      return { browser, product, saved };
    }

    it('só salva com consentimento, criptografado, e lista mascarado', async () => {
      const { saved } = await withSavedAddress();
      expect(saved).toMatchObject({ recipient: 'Maria', line: 'Avenid•••, 1•••', city: 'Rio de Janeiro/RJ', postalCode: '22041-•••' });
      expect(JSON.stringify(saved)).not.toMatch(/Atlântica|52998224725|98888|Apto/);

      const row = await ctx.prisma.address.findFirstOrThrow();
      expect(row.dataEnc).not.toMatch(/Atlântica|52998224725/);
    });

    it('reusa o endereço salvo na cotação e no pedido, sem o navegador ver o CEP', async () => {
      const { browser, product, saved } = await withSavedAddress();
      await browser.post('/shipping/quote/address').send({ addressId: saved.id, items: [{ productId: product.id, quantity: 1 }] }).expect(200);
      expect(ctx.melhorEnvio.quotes.at(-1)?.postalCode).toBe('22041001');

      await browser
        .post('/orders')
        .send({ items: [{ productId: product.id, quantity: 1 }], shippingServiceId: 1, addressId: saved.id })
        .expect(201);
    });

    it('ninguém usa, cota ou apaga endereço de outra pessoa', async () => {
      const { product, saved } = await withSavedAddress('ana@teste.com');
      const bia = await signUp(ctx, 'bia@teste.com');

      await bia.post('/shipping/quote/address').send({ addressId: saved.id, items: [{ productId: product.id, quantity: 1 }] }).expect(404);
      await bia.post('/orders').send({ items: [{ productId: product.id, quantity: 1 }], shippingServiceId: 1, addressId: saved.id }).expect(404);
      await bia.delete(`/addresses/${saved.id}`).expect(404);
      expect((await bia.get('/addresses')).body).toEqual([]);
      expect(await ctx.prisma.address.count()).toBe(1);
    });

    it('dado criptografado copiado para outra conta não abre', async () => {
      const { product } = await withSavedAddress('ana@teste.com');
      const bia = await signUp(ctx, 'bia@teste.com');
      const biaUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'bia@teste.com' } });
      const anaRow = await ctx.prisma.address.findFirstOrThrow();
      const copy = await ctx.prisma.address.create({ data: { userId: biaUser.id, dataEnc: anaRow.dataEnc } });

      expect((await bia.get('/addresses').expect(200)).body).toEqual([]);
      await bia.post('/orders').send({ items: [{ productId: product.id, quantity: 1 }], shippingServiceId: 1, addressId: copy.id }).expect(404);
    });

    it('apaga endereço e limita a 5', async () => {
      const { browser, saved } = await withSavedAddress();
      await browser.delete(`/addresses/${saved.id}`).expect(200);
      expect(await ctx.prisma.address.count()).toBe(0);
      await browser.post('/addresses').send(ADDRESS).expect(201);
      const { userId } = await ctx.prisma.address.findFirstOrThrow();
      await ctx.prisma.address.createMany({ data: Array.from({ length: 4 }, () => ({ userId, dataEnc: 'v1:x:y:z' })) });
      await browser.post('/addresses').send(ADDRESS).expect(409);
    });

    it('exige login', async () => {
      await ctx.http().get('/addresses').expect(401);
      await ctx.http().post('/addresses').send(ADDRESS).expect(401);
    });
  });

  describe('etiqueta e rastreio', () => {
    async function paidOrder() {
      const { browser: admin } = await signUpAdmin(ctx);
      const customer = await signUp(ctx, 'cliente@teste.com');
      const product = await seedProduct(ctx, { price: '3799.90' });
      const order = await customer.post('/orders').send(orderBody(product.id, 1)).expect(201);
      await customer.post(`/orders/${order.body.id}/pay`).send(CARD('approved-1')).expect(201);
      return { admin, customer, orderId: order.body.id as string };
    }

    it('admin gera a etiqueta uma vez só, com o endereço e valor declarado corretos', async () => {
      const { admin, customer, orderId } = await paidOrder();
      const res = await admin.post(`/admin/orders/${orderId}/label`).expect(200);
      expect(res.body.trackingCode).toMatch(/^AA\d{9}BR$/);

      const [cart] = [...ctx.melhorEnvio.carts.values()];
      expect(cart).toMatchObject({ orderId, serviceId: 1, to: { postalCode: '22041001', document: '52998224725' } });
      expect(cart.items[0].unitPrice).toBe(3799.9);

      await admin.post(`/admin/orders/${orderId}/label`).expect(409);
      expect(ctx.melhorEnvio.carts.size).toBe(1);
      expect((await admin.post(`/admin/orders/${orderId}/label/print`).expect(200)).body.url).toContain('ME-1');

      // Cliente vê o rastreio, mas não o ID interno.
      const mine = await customer.get(`/orders/${orderId}`).expect(200);
      expect(mine.body.trackingCode).toBe(res.body.trackingCode);
      expect(mine.body).not.toHaveProperty('shipmentId');
    });

    it('sem CNPJ: seguro limitado a R$ 1.000; com CNPJ: valor total', () => {
      expect(insuredValue(3799.9)).toBe(1000);
      expect(insuredValue(250.5)).toBe(250.5);
      process.env.SHIPPING_COMMERCIAL = 'true';
      try {
        expect(insuredValue(3799.9)).toBe(3799.9);
      } finally {
        delete process.env.SHIPPING_COMMERCIAL;
      }
    });

    it('painel sabe o modo de envio', async () => {
      const { browser: admin } = await signUpAdmin(ctx);
      expect((await admin.get('/admin/shipping/settings').expect(200)).body).toEqual({ commercial: false, insuranceCap: 1000 });
    });

    it('com CNPJ, exige e guarda a chave da nota fiscal', async () => {
      const { admin, orderId } = await paidOrder();
      process.env.SHIPPING_COMMERCIAL = 'true';
      try {
        const missing = await admin.post(`/admin/orders/${orderId}/label`).expect(400);
        expect(missing.body.code).toBe('INVOICE_REQUIRED');
        await admin.post(`/admin/orders/${orderId}/label`).send({ invoiceKey: '123' }).expect(400);

        const key = '3326 1012 3456 7800 0199 5500 1000 0000 0110 0000 0019';
        await admin.post(`/admin/orders/${orderId}/label`).send({ invoiceKey: key }).expect(200);
        const digits = key.replace(/\D/g, '');
        expect([...ctx.melhorEnvio.carts.values()][0].invoiceKey).toBe(digits);
        expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).invoiceKey).toBe(digits);
      } finally {
        delete process.env.SHIPPING_COMMERCIAL;
      }
    });

    it('retoma sem comprar de novo se uma etapa falhar', async () => {
      const { admin, orderId } = await paidOrder();
      ctx.melhorEnvio.failNextCheckout = true;
      await admin.post(`/admin/orders/${orderId}/label`).expect(400);
      await admin.post(`/admin/orders/${orderId}/label`).expect(200);
      expect(ctx.melhorEnvio.carts.size).toBe(1);
    });

    it('não gera etiqueta de pedido não pago, e cliente não acessa as rotas', async () => {
      const { browser: admin } = await signUpAdmin(ctx);
      const customer = await signUp(ctx, 'cliente@teste.com');
      const product = await seedProduct(ctx);
      const order = await customer.post('/orders').send(orderBody(product.id)).expect(201);

      await admin.post(`/admin/orders/${order.body.id}/label`).expect(400);
      await customer.post(`/admin/orders/${order.body.id}/label`).expect(403);
      await customer.post(`/admin/orders/${order.body.id}/address`).expect(403);
    });

    it('rastreio avança o pedido e avisa o cliente por e-mail', async () => {
      const { admin, orderId } = await paidOrder();
      await admin.post(`/admin/orders/${orderId}/label`).expect(200);
      const shipments = ctx.app.get(ShipmentsService);

      ctx.melhorEnvio.move('ME-1', 'posted');
      expect(await shipments.syncTracking()).toMatchObject({ shipped: 1 });
      let order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe('SHIPPED');
      expect(order.shippedAt).not.toBeNull();
      expect(ctx.mail.last('order-shipped', 'cliente@teste.com')?.trackingCode).toBe(order.trackingCode);

      // Rodar de novo não manda e-mail duplicado.
      await shipments.syncTracking();
      expect(ctx.mail.sent.filter((m) => m.kind === 'order-shipped')).toHaveLength(1);

      ctx.melhorEnvio.move('ME-1', 'delivered');
      await admin.post('/admin/shipments/sync').expect(200);
      order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe('DELIVERED');
      expect(ctx.mail.last('order-delivered', 'cliente@teste.com')).toBeDefined();
    });

    it('admin vê o endereço completo só sob demanda, e fica na auditoria', async () => {
      const { admin, orderId } = await paidOrder();
      const list = await admin.get('/admin/orders').expect(200);
      expect(JSON.stringify(list.body)).not.toContain('Atlântica');

      const res = await admin.post(`/admin/orders/${orderId}/address`).expect(200);
      expect(res.body).toMatchObject({ street: 'Avenida Atlântica', number: '1702' });
      const log = await admin.get('/admin/audit-log').expect(200);
      const entry = log.body.find((e: { action: string }) => e.action.endsWith('/orders/:id/address'));
      expect(entry?.target).toBe(orderId);
    });

    it('apaga o endereço de pedidos entregues há mais de 90 dias (LGPD)', async () => {
      const { orderId } = await paidOrder();
      const shipments = ctx.app.get(ShipmentsService);
      await shipments.markDelivered(orderId);

      expect(await shipments.purgeOldAddresses()).toBe(0); // recém-entregue: ainda dentro do prazo de troca
      await ctx.prisma.$executeRaw`UPDATE "Order" SET "updatedAt" = now() - interval '91 days' WHERE id = ${orderId}`;
      expect(await shipments.purgeOldAddresses()).toBe(1);
      expect(await ctx.prisma.orderAddress.count()).toBe(0);
    });
  });
});
