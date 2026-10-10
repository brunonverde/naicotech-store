import { Injectable } from '@nestjs/common';
import {
  InvalidWebhookSignatureError,
  MercadoPagoConfig,
  Order as MpOrder,
  WebhookSignatureValidator,
} from 'mercadopago';

@Injectable()
export class PaymentsService {
  private readonly client = new MercadoPagoConfig({
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN as string,
    options: { timeout: 5000 },
  });
  private readonly mpOrder = new MpOrder(this.client);

  async createPayment(params: {
    orderId: string;
    amount: number;
    payerEmail: string;
    cardToken: string;
  }) {
    const amount = params.amount.toFixed(2);
    return this.mpOrder.create({
      body: {
        type: 'online',
        processing_mode: 'automatic',
        total_amount: amount,
        external_reference: params.orderId,
        payer: { email: params.payerEmail },
        transactions: {
          payments: [
            {
              amount,
              payment_method: {
                id: 'master',
                type: 'credit_card',
                token: params.cardToken,
                installments: 1,
              },
            },
          ],
        },
      },
      // A mesma chave para o mesmo pedido evita cobrança duplicada.
      requestOptions: { idempotencyKey: params.orderId },
    });
  }

  getOrder(id: string) {
    return this.mpOrder.get({ id });
  }

  validateSignature(params: {
    xSignature: string;
    xRequestId: string;
    dataId: string;
  }): boolean {
    try {
      WebhookSignatureValidator.validate({
        xSignature: params.xSignature,
        xRequestId: params.xRequestId,
        dataId: params.dataId.toLowerCase(),
        secret: process.env.MERCADOPAGO_WEBHOOK_SECRET as string,
      });
      return true;
    } catch (error) {
      if (error instanceof InvalidWebhookSignatureError) return false;
      throw error;
    }
  }
}
