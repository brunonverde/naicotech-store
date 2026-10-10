import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MercadoPagoError, MPPaymentError } from 'mercadopago';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import {
  encryptOrderAddress,
  encryptSavedAddress,
  normalizeAddress,
  orderShippingSummary,
} from '../shipping/address';
import { AddressesService, MAX_SAVED_ADDRESSES } from '../shipping/addresses.service';
import { mergeLines, ShippingService } from '../shipping/shipping.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { PayOrderDto } from './dto/pay-order.dto';

// Pedido não pago devolve o estoque depois desse prazo. Sem isso, alguém poderia
// criar pedidos sem pagar até "esgotar" a loja.
export const ORDER_PAYMENT_WINDOW_MS = 30 * 60 * 1000;
const MAX_PENDING_ORDERS_PER_USER = 3;
const EXPIRATION_SWEEP_MS = 5 * 60 * 1000;
// Marca o pedido enquanto o pagamento está sendo enviado ao Mercado Pago.
// Impede duas cobranças simultâneas do mesmo pedido.
export const PAYMENT_PROCESSING = 'PROCESSING';

const orderInclude = { items: true } as const;
// ID interno da etiqueta no Melhor Envio: o cliente não precisa dele.
const orderOmit = { shipmentId: true } as const;

@Injectable()
export class OrdersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrdersService.name);
  private sweepTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
    private readonly shipping: ShippingService,
    private readonly addresses: AddressesService,
  ) {}

  onModuleInit() {
    this.sweepTimer = setInterval(() => {
      this.expireUnpaidOrders().catch((error) =>
        this.logger.error('Falha ao expirar pedidos', error as Error),
      );
    }, EXPIRATION_SWEEP_MS);
    this.sweepTimer.unref();
    void this.expireUnpaidOrders().catch(() => undefined);
  }

  onModuleDestroy() {
    clearInterval(this.sweepTimer);
  }

  async create(userId: string, dto: CreateOrderDto) {
    if (dto.address && dto.addressId) {
      throw new BadRequestException('Envie um endereço salvo ou um endereço novo, não os dois');
    }
    const address = dto.addressId
      ? await this.addresses.getOwned(userId, dto.addressId)
      : normalizeAddress(dto.address!);
    const saveAddress = Boolean(dto.saveAddress && !dto.addressId);
    if (saveAddress && (await this.prisma.address.count({ where: { userId } })) >= MAX_SAVED_ADDRESSES) {
      throw new ConflictException(
        `Você já tem ${MAX_SAVED_ADDRESSES} endereços salvos. Apague um ou desmarque "salvar endereço".`,
      );
    }

    // Recota o frete no servidor: o preço que o navegador mostrou não vale aqui.
    const { option } = await this.shipping.pick(address.postalCode, dto.items, dto.shippingServiceId);
    const shippingPrice = new Prisma.Decimal(option.price);
    const quantities = mergeLines(dto.items);
    const orderId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const pending = await tx.order.count({ where: { userId, status: 'PENDING' } });
      if (pending >= MAX_PENDING_ORDERS_PER_USER) {
        throw new ConflictException(
          'Você já tem pedidos aguardando pagamento. Pague ou aguarde eles expirarem (30 min).',
        );
      }

      let total = new Prisma.Decimal(0);
      const itemsData: { productId: string; quantity: number; unitPrice: Prisma.Decimal }[] = [];

      for (const [productId, quantity] of quantities) {
        const product = await tx.product.findUnique({ where: { id: productId } });
        if (!product) {
          throw new NotFoundException('Um dos produtos do carrinho não existe mais');
        }

        // Baixa atômica: só decrementa se ainda houver estoque suficiente.
        const result = await tx.product.updateMany({
          where: { id: productId, stock: { gte: quantity } },
          data: { stock: { decrement: quantity } },
        });
        if (result.count === 0) {
          throw new ConflictException(`Estoque insuficiente para "${product.name}"`);
        }

        // O preço vem sempre do banco, nunca do cliente.
        total = total.add(product.price.mul(quantity));
        itemsData.push({ productId, quantity, unitPrice: product.price });
      }

      if (saveAddress) {
        await tx.address.create({ data: { userId, dataEnc: encryptSavedAddress(userId, address) } });
      }

      return tx.order.create({
        data: {
          id: orderId,
          userId,
          totalAmount: total.add(shippingPrice),
          status: 'PENDING',
          items: { create: itemsData },
          shippingPrice,
          shippingServiceId: option.serviceId,
          shippingServiceName: option.name,
          shippingCompany: option.company,
          shippingDeliveryDays: option.deliveryDays,
          shippingSummary: orderShippingSummary(address),
          shippingAddress: { create: { dataEnc: encryptOrderAddress(orderId, address) } },
        },
        include: orderInclude,
        omit: orderOmit,
      });
    });
  }

  findMine(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: orderInclude,
      omit: orderOmit,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string, role: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: orderInclude, omit: orderOmit });
    // 404 também para pedido de outra pessoa: não confirma que o ID existe.
    if (!order || (order.userId !== userId && role !== 'ADMIN')) {
      throw new NotFoundException('Pedido não encontrado');
    }
    return order;
  }

  async pay(orderId: string, userId: string, userEmail: string, dto: PayOrderDto) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== userId) throw new NotFoundException('Pedido não encontrado');
    if (order.status !== 'PENDING') {
      throw new BadRequestException('Pedido não está pendente de pagamento');
    }

    // Trava atômica: só um pagamento por vez, e só dentro do prazo do pedido.
    const locked = await this.prisma.order.updateMany({
      where: {
        id: order.id,
        status: 'PENDING',
        paymentId: null,
        createdAt: { gt: new Date(Date.now() - ORDER_PAYMENT_WINDOW_MS) },
      },
      data: { paymentId: PAYMENT_PROCESSING },
    });
    if (locked.count === 0) {
      throw new ConflictException(
        'Este pedido já está em pagamento ou expirou. Atualize a página para ver o status.',
      );
    }

    let payment: Awaited<ReturnType<PaymentsService['createPayment']>>;
    try {
      payment = await this.paymentsService.createPayment({
        orderId: order.id,
        amount: order.totalAmount.toFixed(2),
        payerEmail: userEmail,
        ...dto,
      });
    } catch (error) {
      return this.handlePaymentError(order.id, error);
    }

    const paid = this.paymentsService.isApproved(payment);
    return this.prisma.order.update({
      where: { id: order.id },
      data: { status: paid ? 'PAID' : 'PENDING', paymentId: payment.id },
      include: orderInclude,
      omit: orderOmit,
    });
  }

  private async handlePaymentError(orderId: string, error: unknown): Promise<never> {
    const releaseLock = () =>
      this.prisma.order.updateMany({
        where: { id: orderId, paymentId: PAYMENT_PROCESSING },
        data: { paymentId: null },
      });

    // 402: cartão recusado. Libera o pedido para outra tentativa.
    if (error instanceof MPPaymentError) {
      await releaseLock();
      throw new BadRequestException(
        'Pagamento recusado. Confira os dados do cartão ou tente outro cartão.',
      );
    }
    if (error instanceof MercadoPagoError && [400, 409, 422].includes(error.status)) {
      this.logger.error(
        `Mercado Pago respondeu ${error.status} (${error.error}): ${error.message}`,
        JSON.stringify(error.causes),
      );
      await releaseLock();
      throw new BadRequestException('Não foi possível processar o pagamento com esses dados');
    }

    // Timeout, falha de rede ou 5xx: não dá para saber se a cobrança foi criada.
    // O pedido fica travado (sem nova cobrança) até o webhook confirmar o resultado.
    this.logger.error(
      `Resultado incerto do pagamento do pedido ${orderId}; aguardando webhook`,
      error as Error,
    );
    throw new ServiceUnavailableException(
      'Não conseguimos confirmar o pagamento agora. Aguarde alguns minutos e atualize a página antes de tentar de novo.',
    );
  }

  // Cancela pedidos não pagos fora do prazo e devolve o estoque.
  async expireUnpaidOrders() {
    const cutoff = new Date(Date.now() - ORDER_PAYMENT_WINDOW_MS);
    const expired = await this.prisma.order.findMany({
      where: { status: 'PENDING', paymentId: null, createdAt: { lt: cutoff } },
      select: { id: true },
      take: 100,
    });

    for (const { id } of expired) {
      await this.prisma.$transaction(async (tx) => {
        // Condicional: se um pagamento começou nesse meio-tempo, não cancela.
        const { count } = await tx.order.updateMany({
          where: { id, status: 'PENDING', paymentId: null },
          data: { status: 'CANCELLED' },
        });
        if (count === 0) return;
        // Pedido nunca pago: o endereço não é mais necessário.
        await tx.orderAddress.deleteMany({ where: { orderId: id } });
        const items = await tx.orderItem.findMany({ where: { orderId: id } });
        for (const item of items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
      });
    }
    if (expired.length) this.logger.log(`${expired.length} pedido(s) não pago(s) expirado(s)`);

    const stuck = await this.prisma.order.count({
      where: { paymentId: PAYMENT_PROCESSING, updatedAt: { lt: new Date(Date.now() - 2 * 60 * 60 * 1000) } },
    });
    if (stuck) {
      this.logger.warn(`${stuck} pedido(s) com pagamento sem confirmação há mais de 2h: conferir no painel do Mercado Pago`);
    }
  }
}
