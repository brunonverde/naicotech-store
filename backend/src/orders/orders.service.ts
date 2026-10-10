import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async create(userId: string, dto: CreateOrderDto) {
    // Une itens repetidos do mesmo produto.
    const quantities = new Map<string, number>();
    for (const item of dto.items) {
      quantities.set(
        item.productId,
        (quantities.get(item.productId) ?? 0) + item.quantity,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      let total = new Prisma.Decimal(0);
      const itemsData: {
        productId: string;
        quantity: number;
        unitPrice: Prisma.Decimal;
      }[] = [];

      for (const [productId, quantity] of quantities) {
        const product = await tx.product.findUnique({ where: { id: productId } });
        if (!product) {
          throw new NotFoundException(`Produto ${productId} não encontrado`);
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

      return tx.order.create({
        data: {
          userId,
          totalAmount: total,
          status: 'PENDING',
          items: { create: itemsData },
        },
        include: { items: true },
      });
    });
  }

  findMine(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string, role: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (order.userId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('Acesso negado');
    }
    return order;
  }

  async pay(orderId: string, userId: string, userEmail: string, cardToken: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (order.userId !== userId) throw new ForbiddenException('Acesso negado');
    if (order.status !== 'PENDING') {
      throw new BadRequestException('Pedido não está pendente de pagamento');
    }

    const payment = await this.paymentsService.createPayment({
      orderId: order.id,
      amount: Number(order.totalAmount),
      payerEmail: userEmail,
      cardToken,
    });

    const paid = payment.transactions?.payments?.[0]?.status_detail === 'accredited';

    return this.prisma.order.update({
      where: { id: order.id },
      data: { status: paid ? 'PAID' : 'PENDING', paymentId: payment.id },
    });
  }
}
