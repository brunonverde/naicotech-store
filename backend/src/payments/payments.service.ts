import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  InvalidWebhookSignatureError,
  MercadoPagoConfig,
  Order as MpOrder,
  WebhookSignatureValidator,
} from 'mercadopago';
import type { CardType } from '../orders/dto/pay-order.dto';

type MpOrderResponse = Awaited<ReturnType<MpOrder['get']>>;

// Mesmo pedido + mesmo token (clique duplo) = mesma chave, sem cobrança duplicada.
// Um cartão novo gera token novo, então uma nova tentativa após recusa não
// reaproveita a resposta antiga. Formatado como UUID, que é o que a API espera.
function idempotencyKey(orderId: string, cardToken: string): string {
  const hex = createHash('sha256').update(`${orderId}:${cardToken}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

@Injectable()
export class PaymentsService {
  private readonly client = new MercadoPagoConfig({
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN as string,
    options: { timeout: 15000 },
  });
  private readonly mpOrder = new MpOrder(this.client);

  async createPayment(params: {
    orderId: string;
    amount: string;
    payerEmail: string;
    cardToken: string;
    paymentMethodId: string;
    paymentType: CardType;
    installments: number;
  }) {
    // Débito é sempre à vista.
    const installments = params.paymentType === 'debit_card' ? 1 : params.installments;
    return this.mpOrder.create({
      body: {
        type: 'online',
        processing_mode: 'automatic',
        total_amount: params.amount,
        external_reference: params.orderId,
        payer: { email: params.payerEmail },
        transactions: {
          payments: [
            {
              amount: params.amount,
              payment_method: {
                id: params.paymentMethodId,
                type: params.paymentType,
                token: params.cardToken,
                installments,
              },
            },
          ],
        },
      },
      requestOptions: {
        idempotencyKey: idempotencyKey(params.orderId, params.cardToken),
      },
    });
  }

  getOrder(id: string) {
    return this.mpOrder.get({ id });
  }

  isApproved(order: MpOrderResponse): boolean {
    return (
      order.status === 'processed' &&
      order.transactions?.payments?.[0]?.status_detail === 'accredited'
    );
  }

  validateSignature(params: { xSignature: string; xRequestId: string; dataId: string }): boolean {
    try {
      WebhookSignatureValidator.validate({
        xSignature: params.xSignature,
        xRequestId: params.xRequestId,
        dataId: params.dataId.toLowerCase(),
        secret: process.env.MERCADOPAGO_WEBHOOK_SECRET as string,
        // Rejeita notificações antigas reenviadas por terceiros (replay).
        toleranceSeconds: 900,
      });
      return true;
    } catch (error) {
      if (error instanceof InvalidWebhookSignatureError) return false;
      throw error;
    }
  }
}
