import { createHmac } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { MPConnectionError, MPPaymentError } from 'mercadopago';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MailService } from '../src/mail/mail.service';
import { PaymentsService } from '../src/payments/payments.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { MelhorEnvioClient, MelhorEnvioError } from '../src/shipping/melhor-envio.client';
import type { LabelRequest, MeQuote, MeTracking, PackageItem } from '../src/shipping/melhor-envio.client';
import { currentStep, totpCode } from '../src/admin/totp';
import { assertTestDatabase } from './test-env';

export const ORIGIN = 'http://localhost:5173';
export const PASSWORD = 'senhaForte123';

// ---------- E-mail simulado: guarda os e-mails em vez de enviar ----------
export interface SentMail {
  kind:
    | 'verification'
    | 'account-exists'
    | 'password-reset'
    | 'password-changed'
    | 'security-alert'
    | 'order-shipped'
    | 'order-delivered'
    | 'account-deleted';
  subject?: string;
  to: string;
  link?: string;
  trackingCode?: string | null;
}

export class FakeMailService {
  sent: SentMail[] = [];

  async sendEmailVerification(to: string, _name: string, link: string) {
    this.sent.push({ kind: 'verification', to, link });
  }
  async sendAccountExistsNotice(to: string) {
    this.sent.push({ kind: 'account-exists', to });
  }
  async sendPasswordReset(to: string, _name: string, link: string) {
    this.sent.push({ kind: 'password-reset', to, link });
  }
  async sendPasswordChangedNotice(to: string) {
    this.sent.push({ kind: 'password-changed', to });
  }
  async sendSecurityAlert(to: string, _name: string, subject: string) {
    this.sent.push({ kind: 'security-alert', to, subject });
  }
  async sendOrderShipped(to: string, _name: string, order: { trackingCode: string | null; link: string }) {
    this.sent.push({ kind: 'order-shipped', to, link: order.link, trackingCode: order.trackingCode });
  }
  async sendOrderDelivered(to: string, _name: string, order: { link: string }) {
    this.sent.push({ kind: 'order-delivered', to, link: order.link });
  }
  async sendAccountDeleted(to: string) {
    this.sent.push({ kind: 'account-deleted', to });
  }

  last(kind: SentMail['kind'], to: string): SentMail | undefined {
    return [...this.sent].reverse().find((m) => m.kind === kind && m.to === to);
  }

  tokenFrom(kind: SentMail['kind'], to: string): string {
    const link = this.last(kind, to)?.link;
    if (!link) throw new Error(`Nenhum e-mail "${kind}" para ${to}`);
    return new URL(link).searchParams.get('token') ?? '';
  }
}

// ---------- Mercado Pago simulado ----------
// O resultado depende do token do cartão: approved-*, rejected-*, pending-*, timeout-*, slow-approved-*.
// (Tokens com 10+ caracteres: a API valida o tamanho mínimo.)
type CreateParams = Parameters<PaymentsService['createPayment']>[0];
type MpOrder = Awaited<ReturnType<PaymentsService['getOrder']>>;

export class FakePaymentsService extends PaymentsService {
  calls: CreateParams[] = [];
  mpOrders = new Map<string, Partial<MpOrder>>();
  private seq = 0;

  override async createPayment(params: CreateParams) {
    this.calls.push(params);
    const id = `ORDTEST${++this.seq}`;
    const token = params.cardToken;

    if (token.startsWith('slow-')) await new Promise((r) => setTimeout(r, 300));
    if (token.startsWith('rejected-')) {
      throw new MPPaymentError({ status: 402, message: 'payment rejected' });
    }
    if (token.startsWith('timeout-')) throw new MPConnectionError(new Error('timeout'));

    const approved = token.includes('approved-');
    const order = {
      id,
      external_reference: params.orderId,
      total_amount: params.amount,
      status: approved ? 'processed' : 'action_required',
      transactions: {
        payments: [{ status: approved ? 'processed' : 'pending', status_detail: approved ? 'accredited' : 'pending_review_manual' }],
      },
    };
    this.mpOrders.set(id, order as Partial<MpOrder>);
    return order as unknown as Awaited<ReturnType<PaymentsService['createPayment']>>;
  }

  override async getOrder(id: string) {
    const order = this.mpOrders.get(id);
    if (!order) throw new Error(`Order ${id} não existe no fake`);
    return order as MpOrder;
  }
}

// ---------- Melhor Envio simulado ----------
// PAC (id 1) R$ 30,00 e SEDEX (id 2) R$ 55,50; Jadlog (id 3) volta com erro (não atende).
// CEP começando com 0 = nenhuma transportadora atende.
export class FakeMelhorEnvio {
  quotes: { postalCode: string; items: PackageItem[] }[] = [];
  carts = new Map<string, LabelRequest>();
  shipments = new Map<string, MeTracking>();
  failNextCheckout = false;
  private seq = 0;

  async calculate(postalCode: string, items: PackageItem[]): Promise<MeQuote[]> {
    this.quotes.push({ postalCode, items });
    if (postalCode.startsWith('0')) return [];
    const packages = [{ weight: 1.5, dimensions: { height: 12, width: 22, length: 32 } }];
    return [
      { id: 2, name: 'SEDEX', custom_price: '55.50', custom_delivery_time: 2, company: { id: 1, name: 'Correios' }, packages },
      { id: 1, name: 'PAC', custom_price: '30.00', custom_delivery_time: 7, company: { id: 1, name: 'Correios' }, packages },
      { id: 3, name: '.Package', error: 'Transportadora não atende este trecho.', company: { id: 2, name: 'Jadlog' } },
    ];
  }

  async addToCart(req: LabelRequest) {
    const id = `ME-${++this.seq}`;
    this.carts.set(id, req);
    this.shipments.set(id, { id, status: 'pending', tracking: null });
    return id;
  }

  async checkout(id: string) {
    if (this.failNextCheckout) {
      this.failNextCheckout = false;
      throw new MelhorEnvioError(422, 'Saldo insuficiente', '');
    }
    this.shipments.set(id, { ...this.shipments.get(id)!, status: 'released', paid_at: new Date().toISOString() });
  }

  async generate(id: string) {
    this.shipments.set(id, { ...this.shipments.get(id)!, generated_at: new Date().toISOString(), tracking: `AA${id.replace(/\D/g, '').padStart(9, '0')}BR` });
  }

  async printUrl(id: string) {
    return `https://sandbox.melhorenvio.com.br/imprimir/${id}`;
  }

  async tracking(ids: string[]) {
    return Object.fromEntries(ids.filter((id) => this.shipments.has(id)).map((id) => [id, this.shipments.get(id)!]));
  }

  /** Simula a transportadora movimentando o pacote. */
  move(id: string, status: 'posted' | 'delivered') {
    const at = new Date().toISOString();
    this.shipments.set(id, { ...this.shipments.get(id)!, status, ...(status === 'posted' ? { posted_at: at } : { delivered_at: at }) });
  }
}

// Endereço válido de teste (CPF com dígitos verificadores corretos, mas fictício).
export const ADDRESS = {
  recipientName: 'Maria da Silva',
  document: '529.982.247-25',
  phone: '(21) 98888-7777',
  postalCode: '22041-001',
  street: 'Avenida Atlântica',
  number: '1702',
  complement: 'Apto 501',
  district: 'Copacabana',
  city: 'Rio de Janeiro',
  state: 'RJ',
};

export const PAC = 1;
export const SEDEX = 2;

export function orderBody(productId: string, quantity = 1, extra: Record<string, unknown> = {}) {
  return { items: [{ productId, quantity }], shippingServiceId: PAC, address: ADDRESS, ...extra };
}

// ---------- App de teste ----------
export interface TestContext {
  app: NestExpressApplication;
  prisma: PrismaService;
  mail: FakeMailService;
  payments: FakePaymentsService;
  melhorEnvio: FakeMelhorEnvio;
  http: () => ReturnType<typeof request>;
}

export async function createTestApp(): Promise<TestContext> {
  const mail = new FakeMailService();
  const melhorEnvio = new FakeMelhorEnvio();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mail)
    .overrideProvider(PaymentsService)
    .useClass(FakePaymentsService)
    .overrideProvider(MelhorEnvioClient)
    .useValue(melhorEnvio)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
  configureApp(app);
  await app.init();

  const prisma = app.get(PrismaService);
  await resetDatabase(prisma);
  return {
    app,
    prisma,
    mail,
    payments: app.get(PaymentsService) as FakePaymentsService,
    melhorEnvio,
    http: () => request(app.getHttpServer()),
  };
}

export async function resetDatabase(prisma: PrismaService) {
  assertTestDatabase(process.env.DATABASE_URL);
  await prisma.$executeRawUnsafe(
    'TRUNCATE "AdminAuditLog", "OrderAddress", "Address", "OrderItem", "Order", "Review", "Product", "Category", "User" RESTART IDENTITY CASCADE',
  );
}

// Agente com "navegador": guarda o cookie de sessão entre as requisições.
export function agent(ctx: TestContext): TestAgent {
  return request.agent(ctx.app.getHttpServer());
}

// Cadastra, confirma o e-mail e devolve um agente já logado.
export async function signUp(ctx: TestContext, email: string, name = 'Cliente Teste') {
  await ctx.http().post('/auth/register').send({ name, email, password: PASSWORD, acceptTerms: true }).expect(201);
  const token = ctx.mail.tokenFrom('verification', email);
  const browser = agent(ctx);
  await browser.post('/auth/verify-email').send({ token }).expect(200);
  return browser;
}

export async function makeAdmin(ctx: TestContext, email: string) {
  await ctx.prisma.user.update({ where: { email }, data: { role: 'ADMIN' } });
}

export async function seedProduct(ctx: TestContext, data: { stock?: number; price?: string } = {}) {
  const category = await ctx.prisma.category.upsert({
    where: { slug: 'placas-de-video' },
    update: {},
    create: { name: 'Placas de Vídeo', slug: 'placas-de-video' },
  });
  return ctx.prisma.product.create({
    data: {
      name: 'RTX 5060 Ti 16GB',
      description: 'Placa de vídeo de teste',
      price: data.price ?? '3799.90',
      costPrice: '3250.00',
      condition: 'NEW',
      stock: data.stock ?? 5,
      categoryId: category.id,
    },
  });
}

export const CARD = (token: string) => ({
  cardToken: token,
  paymentMethodId: 'visa',
  paymentType: 'credit_card',
  installments: 1,
});

// Assina uma notificação de webhook como o Mercado Pago faria.
export function signWebhook(dataId: string, requestId = 'req-1', ts = Math.floor(Date.now() / 1000)) {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', process.env.MERCADOPAGO_WEBHOOK_SECRET as string)
    .update(manifest)
    .digest('hex');
  return { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId };
}

// Admin com verificação em duas etapas já ativa e sessão de painel aberta.
export async function signUpAdmin(ctx: TestContext, email = 'admin@teste.com') {
  const browser = await signUp(ctx, email, 'Admin Teste');
  await makeAdmin(ctx, email);
  const setup = await browser.post('/admin/2fa/setup').send({ password: PASSWORD }).expect(200);
  const secret: string = setup.body.secret;
  const enabled = await browser.post('/admin/2fa/enable').send({ code: totpCode(secret, currentStep()) }).expect(200);
  const adminCookie = (enabled.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('naicotech_admin='))!.split(';')[0];
  return { browser, secret, adminCookie, recoveryCodes: enabled.body.recoveryCodes as string[] };
}

/** Código válido para um intervalo futuro (o atual já foi usado no cadastro). */
export const nextTotp = (secret: string, offset = 1) => totpCode(secret, currentStep() + offset);

// Login direto, devolvendo só o cookie de sessão (para montar requisições à mão).
export async function loginCookie(ctx: TestContext, email: string) {
  const res = await ctx.http().post('/auth/login').send({ email, password: PASSWORD }).expect(200);
  return (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
}
