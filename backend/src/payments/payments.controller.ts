import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Headers('x-signature') xSignature: string,
    @Headers('x-request-id') xRequestId: string,
    @Query('data.id') dataId: string,
    @Query('type') type: string,
  ) {
    if (type !== 'order' || !dataId) return { received: true };

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
      const order = await this.paymentsService.getOrder(dataId);
      const detail = order.transactions?.payments?.[0]?.status_detail;
      if (detail === 'accredited') {
        await this.prisma.order.updateMany({
          where: { paymentId: dataId, status: 'PENDING' },
          data: { status: 'PAID' },
        });
      }
    } catch (error) {
      this.logger.error('Falha ao processar webhook', error as Error);
    }
    return { received: true };
  }
}
