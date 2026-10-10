import { Controller, Headers, HttpCode, Logger, Post, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { PAYMENT_PROCESSING } from '../orders/orders.service';

const FAILED_STATUSES = new Set(['failed', 'canceled', 'cancelled', 'expired']);
const REVERSED_STATUSES = new Set(['refunded', 'charged_back']);

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly prisma: PrismaService,
  ) {}

  // Chamado pelos servidores do Mercado Pago. Sempre responde 200 para não
  // revelar nada a quem estiver testando o endpoint.
  @Post('webhook')
  @HttpCode(200)
  @SkipThrottle()
  async webhook(
    @Headers('x-signature') xSignature: string,
    @Headers('x-request-id') xRequestId: string,
    @Query('data.id') dataId: string,
    @Query('type') type: string,
  ) {
    if (type !== 'order' || typeof dataId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(dataId)) {
      return { received: true };
    }

    const valid = this.paymentsService.validateSignature({
      xSignature: xSignature ?? '',
      xRequestId: xRequestId ?? '',
      dataId,
    });
    if (!valid) {
      this.logger.warn('Webhook com assinatura inválida ignorado');
      return { received: true };
    }

    try {
      await this.process(dataId);
    } catch (error) {
      this.logger.error('Falha ao processar webhook', error as Error);
    }
    return { received: true };
  }

  private async process(mpOrderId: string) {
    // A fonte da verdade é a consulta direta à API do Mercado Pago, não o corpo
    // da notificação: mesmo uma notificação repetida não muda o resultado.
    const mpOrder = await this.paymentsService.getOrder(mpOrderId);
    const orderId = mpOrder.external_reference;
    if (!orderId) return;

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      this.logger.warn(`Webhook para pedido inexistente (${mpOrderId})`);
      return;
    }
    // Ignora notificação de uma tentativa antiga já substituída por outra.
    if (order.paymentId && order.paymentId !== PAYMENT_PROCESSING && order.paymentId !== mpOrderId) {
      return;
    }

    if (this.paymentsService.isApproved(mpOrder)) {
      // O valor pago precisa ser exatamente o total do pedido no nosso banco.
      if (mpOrder.total_amount !== order.totalAmount.toFixed(2)) {
        this.logger.error(
          `Valor divergente no pedido ${order.id}: pago ${mpOrder.total_amount}, esperado ${order.totalAmount.toFixed(2)}`,
        );
        return;
      }
      await this.prisma.order.updateMany({
        where: { id: order.id, status: 'PENDING' },
        data: { status: 'PAID', paymentId: mpOrderId },
      });
      return;
    }

    const status = mpOrder.status ?? '';
    if (FAILED_STATUSES.has(status)) {
      // Recusado depois da análise: libera o pedido para uma nova tentativa.
      await this.prisma.order.updateMany({
        where: { id: order.id, status: 'PENDING', paymentId: { in: [mpOrderId, PAYMENT_PROCESSING] } },
        data: { paymentId: null },
      });
    } else if (REVERSED_STATUSES.has(status)) {
      const { count } = await this.prisma.order.updateMany({
        where: { id: order.id, status: { in: ['PAID', 'PENDING'] }, paymentId: mpOrderId },
        data: { status: 'CANCELLED' },
      });
      if (count) this.logger.warn(`Pedido ${order.id} cancelado: pagamento ${status}`);
    } else if (order.paymentId === PAYMENT_PROCESSING) {
      // Ainda em análise: registra o ID para acompanhar.
      await this.prisma.order.updateMany({
        where: { id: order.id, paymentId: PAYMENT_PROCESSING },
        data: { paymentId: mpOrderId },
      });
    }
  }
}
