import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { isCommercialShipping, NON_COMMERCIAL_INSURANCE_CAP } from '../config/env';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { decryptOrderAddress } from './address';
import type { ShippingAddress } from './address';
import { MelhorEnvioClient, MelhorEnvioError } from './melhor-envio.client';
import { ShippingService } from './shipping.service';

const SWEEP_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// LGPD: o endereço do pedido só é guardado enquanto for necessário
// (entrega + prazo de arrependimento/troca). Depois é apagado.
export const ADDRESS_RETENTION_DELIVERED_MS = 90 * DAY_MS;
export const ADDRESS_RETENTION_CANCELLED_MS = 30 * DAY_MS;
// Trava enquanto a etiqueta está sendo comprada (evita comprar duas vezes).
const LABEL_PROCESSING = 'processing';
const LABEL_STUCK_MS = 5 * 60 * 1000;

export const trackingUrl = (code: string) =>
  `https://www.melhorrastreio.com.br/rastreio/${encodeURIComponent(code)}`;

export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

@Injectable()
export class ShipmentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ShipmentsService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly melhorEnvio: MelhorEnvioClient,
    private readonly shipping: ShippingService,
    private readonly mail: MailService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.sweep(), SWEEP_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  private async sweep() {
    try {
      await this.syncTracking();
    } catch (error) {
      this.logger.error('Falha ao atualizar rastreios', error as Error);
    }
    try {
      await this.purgeOldAddresses();
    } catch (error) {
      this.logger.error('Falha ao apagar endereços antigos', error as Error);
    }
  }

  /** Modo de envio atual, para o painel avisar sobre o limite do seguro. */
  settings() {
    const commercial = isCommercialShipping();
    return { commercial, insuranceCap: commercial ? null : NON_COMMERCIAL_INSURANCE_CAP };
  }

  /** Endereço completo do pedido (só para o painel de admin, com auditoria). */
  async orderAddress(orderId: string): Promise<ShippingAddress> {
    const row = await this.prisma.orderAddress.findUnique({ where: { orderId } });
    if (!row) throw new NotFoundException('Endereço não disponível (pedido sem entrega ou já anonimizado)');
    return decryptOrderAddress(orderId, row.dataEnc);
  }

  /**
   * Compra e gera a etiqueta no Melhor Envio. São 3 chamadas (carrinho, pagamento,
   * geração); se uma falhar, a próxima tentativa continua de onde parou, sem comprar de novo.
   */
  async generateLabel(orderId: string, invoiceKey?: string) {
    if (isCommercialShipping() && !invoiceKey) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVOICE_REQUIRED',
        message: 'Informe a chave da nota fiscal (NF-e) deste pedido para gerar a etiqueta.',
      });
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: { select: { name: true } } } } },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (order.status !== 'PAID') throw new BadRequestException('A etiqueta só pode ser gerada para pedido pago');
    if (!order.shippingServiceId) throw new BadRequestException('Pedido sem frete escolhido');
    // "pending" = ficou no carrinho do Melhor Envio sem pagar (tentativa anterior falhou).
    if (order.shipmentStatus && !['pending', LABEL_PROCESSING].includes(order.shipmentStatus)) {
      throw new ConflictException('A etiqueta deste pedido já foi gerada');
    }

    const locked = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        status: 'PAID',
        OR: [
          { shipmentStatus: null },
          { shipmentStatus: 'pending' },
          { shipmentStatus: LABEL_PROCESSING, updatedAt: { lt: new Date(Date.now() - LABEL_STUCK_MS) } },
        ],
      },
      data: { shipmentStatus: LABEL_PROCESSING },
    });
    if (locked.count === 0) throw new ConflictException('A etiqueta já está sendo gerada. Aguarde um instante.');

    try {
      let shipmentId = order.shipmentId;
      if (!shipmentId) {
        const address = await this.orderAddress(orderId);
        const lines = order.items.map((i) => ({ productId: i.productId, quantity: i.quantity }));
        const { option, volumes, items } = await this.shipping.pick(address.postalCode, lines, order.shippingServiceId);
        shipmentId = await this.melhorEnvio.addToCart({
          orderId,
          serviceId: option.serviceId,
          companyId: option.companyId,
          to: address,
          // Valor declarado = o que o cliente pagou, não o preço atual do produto.
          items: items.map((item) => ({
            ...item,
            unitPrice: Number(order.items.find((i) => i.productId === item.id)?.unitPrice ?? item.unitPrice),
          })),
          volumes,
          invoiceKey,
        });
        await this.prisma.order.update({ where: { id: orderId }, data: { shipmentId, invoiceKey: invoiceKey ?? null } });
      }

      // Retomada: o Melhor Envio diz em que etapa a etiqueta parou.
      const current = (await this.melhorEnvio.tracking([shipmentId]))[shipmentId];
      if (!current?.paid_at && current?.status === 'pending') await this.melhorEnvio.checkout(shipmentId);
      if (!current?.generated_at) await this.melhorEnvio.generate(shipmentId);

      const after = (await this.melhorEnvio.tracking([shipmentId]))[shipmentId];
      return this.prisma.order.update({
        where: { id: orderId },
        data: { shipmentStatus: after?.status ?? 'released', trackingCode: after?.tracking ?? null },
      });
    } catch (error) {
      await this.prisma.order.updateMany({
        where: { id: orderId, shipmentStatus: LABEL_PROCESSING },
        data: { shipmentStatus: null },
      });
      if (error instanceof MelhorEnvioError) {
        throw new BadRequestException(`Melhor Envio: ${error.message}${error.detail ? ` (${error.detail})` : ''}`);
      }
      throw error;
    }
  }

  async printUrl(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { shipmentId: true, shipmentStatus: true } });
    if (!order?.shipmentId || order.shipmentStatus === LABEL_PROCESSING) {
      throw new BadRequestException('Gere a etiqueta antes de imprimir');
    }
    const url = await this.melhorEnvio.printUrl(order.shipmentId);
    // O painel abre esse link direto: só https (nada de javascript:, data: etc.).
    if (!isHttpsUrl(url)) {
      this.logger.error(`Melhor Envio devolveu uma URL de impressão inválida para o pedido ${orderId}`);
      throw new BadGatewayException('O Melhor Envio devolveu um link de impressão inválido. Tente de novo.');
    }
    return { url };
  }

  /** Consulta o Melhor Envio e avança os pedidos postados/entregues, avisando o cliente. */
  async syncTracking() {
    const orders = await this.prisma.order.findMany({
      where: { status: { in: ['PAID', 'SHIPPED'] }, shipmentId: { not: null }, shipmentStatus: { not: LABEL_PROCESSING } },
      select: { id: true, shipmentId: true },
      orderBy: { updatedAt: 'asc' },
      take: 100,
    });
    if (!orders.length) return { checked: 0, shipped: 0, delivered: 0 };

    const result = await this.melhorEnvio.tracking(orders.map((o) => o.shipmentId as string));
    let shipped = 0;
    let delivered = 0;
    for (const order of orders) {
      const t = result[order.shipmentId as string];
      if (!t) continue;
      await this.prisma.order.update({
        where: { id: order.id },
        data: { shipmentStatus: t.status, ...(t.tracking ? { trackingCode: t.tracking } : {}) },
      });
      if (t.status === 'posted' && (await this.markShipped(order.id, t.posted_at))) shipped++;
      if (t.status === 'delivered' && (await this.markDelivered(order.id, t.delivered_at))) delivered++;
    }
    return { checked: orders.length, shipped, delivered };
  }

  /** PAID → SHIPPED (pelo rastreio ou à mão no painel). Devolve false se já tinha mudado. */
  async markShipped(orderId: string, at?: string | null) {
    const { count } = await this.prisma.order.updateMany({
      where: { id: orderId, status: 'PAID' },
      data: { status: 'SHIPPED', shippedAt: at ? new Date(at) : new Date() },
    });
    if (count) await this.notify(orderId, 'shipped');
    return count > 0;
  }

  /** PAID/SHIPPED → DELIVERED. */
  async markDelivered(orderId: string, at?: string | null) {
    const { count } = await this.prisma.order.updateMany({
      where: { id: orderId, status: { in: ['PAID', 'SHIPPED'] } },
      data: { status: 'DELIVERED', deliveredAt: at ? new Date(at) : new Date() },
    });
    if (count) await this.notify(orderId, 'delivered');
    return count > 0;
  }

  private async notify(orderId: string, kind: 'shipped' | 'delivered') {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { trackingCode: true, shippingCompany: true, shippingServiceName: true, user: { select: { name: true, email: true } } },
    });
    if (!order) return;
    const link = `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/pedidos/${orderId}`;
    try {
      if (kind === 'shipped') {
        await this.mail.sendOrderShipped(order.user.email, order.user.name, {
          orderNumber: orderId.slice(0, 8),
          carrier: [order.shippingCompany, order.shippingServiceName].filter(Boolean).join(' '),
          trackingCode: order.trackingCode,
          link,
        });
      } else {
        await this.mail.sendOrderDelivered(order.user.email, order.user.name, { orderNumber: orderId.slice(0, 8), link });
      }
    } catch (error) {
      this.logger.error(`Falha ao enviar e-mail de ${kind} do pedido ${orderId}`, error as Error);
    }
  }

  /** LGPD: apaga o endereço de pedidos encerrados há mais tempo que o necessário. */
  async purgeOldAddresses() {
    const now = Date.now();
    const { count } = await this.prisma.orderAddress.deleteMany({
      where: {
        order: {
          OR: [
            { status: 'DELIVERED', updatedAt: { lt: new Date(now - ADDRESS_RETENTION_DELIVERED_MS) } },
            { status: 'CANCELLED', updatedAt: { lt: new Date(now - ADDRESS_RETENTION_CANCELLED_MS) } },
          ],
        },
      },
    });
    if (count) this.logger.log(`${count} endereço(s) de pedidos antigos apagado(s)`);
    return count;
  }
}
