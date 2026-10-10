import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { OrderStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ShipmentsService } from '../shipping/shipments.service';

// Mudanças de status que o admin pode fazer. PENDING expira sozinho, PAID vem do
// pagamento e CANCELLED de expiração/estorno: nada disso é feito à mão.
const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = { PAID: 'SHIPPED', SHIPPED: 'DELIVERED' };

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shipments: ShipmentsService,
  ) {}

  products() {
    return this.prisma.product.findMany({
      include: { category: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  orders(status?: OrderStatus) {
    return this.prisma.order.findMany({
      where: status ? { status } : undefined,
      include: {
        user: { select: { name: true, email: true } },
        items: { include: { product: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async updateOrderStatus(id: string, status: 'SHIPPED' | 'DELIVERED') {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (NEXT_STATUS[order.status] !== status) {
      throw new BadRequestException(`Não é possível mudar de ${order.status} para ${status}`);
    }
    // Condicional (dentro do markShipped/markDelivered): duas abas mudando ao mesmo
    // tempo não pulam etapas nem mandam dois e-mails.
    const changed =
      status === 'SHIPPED'
        ? await this.shipments.markShipped(id)
        : await this.shipments.markDelivered(id);
    if (!changed) {
      throw new BadRequestException('O pedido mudou enquanto você editava. Atualize a página.');
    }
    return this.prisma.order.findUniqueOrThrow({ where: { id } });
  }

  auditLog() {
    return this.prisma.adminAuditLog.findMany({
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
