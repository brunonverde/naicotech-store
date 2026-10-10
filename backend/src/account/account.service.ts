import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { decryptOrderAddress, decryptSavedAddress } from '../shipping/address';

// Direitos do titular (LGPD, art. 18): acesso aos dados (exportação) e eliminação (exclusão da conta).
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // Exportar ou excluir revela/apaga tudo: sempre pede a senha de novo, para uma
  // sessão esquecida aberta (ou roubada) não bastar.
  private async confirmPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Senha incorreta');
    }
    return user;
  }

  /** Cópia de todos os dados pessoais que a loja guarda sobre a pessoa. */
  async export(userId: string, password: string) {
    const user = await this.confirmPassword(userId, password);
    const [addresses, orders, reviews] = await Promise.all([
      this.prisma.address.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.order.findMany({
        where: { userId },
        include: { items: { include: { product: { select: { name: true } } } }, shippingAddress: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.review.findMany({
        where: { userId },
        include: { product: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const tryDecrypt = <T>(fn: () => T) => {
      try {
        return fn();
      } catch {
        return null;
      }
    };

    return {
      exportedAt: new Date().toISOString(),
      store: 'NaicoTech Store',
      account: {
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        emailVerifiedAt: user.emailVerifiedAt,
        termsAcceptedAt: user.termsAcceptedAt,
        twoFactorEnabled: Boolean(user.totpEnabledAt),
      },
      savedAddresses: addresses.map((a) => ({
        createdAt: a.createdAt,
        ...tryDecrypt(() => decryptSavedAddress(userId, a.dataEnc)),
      })),
      orders: orders.map((o) => ({
        id: o.id,
        createdAt: o.createdAt,
        status: o.status,
        totalAmount: o.totalAmount,
        shippingPrice: o.shippingPrice,
        shipping: o.shippingServiceName ? `${o.shippingCompany} ${o.shippingServiceName}` : null,
        trackingCode: o.trackingCode,
        shippedAt: o.shippedAt,
        deliveredAt: o.deliveredAt,
        items: o.items.map((i) => ({ product: i.product.name, quantity: i.quantity, unitPrice: i.unitPrice })),
        // Apagado automaticamente depois da entrega + prazo de troca.
        deliveryAddress: o.shippingAddress ? tryDecrypt(() => decryptOrderAddress(o.id, o.shippingAddress!.dataEnc)) : null,
      })),
      reviews: reviews.map((r) => ({ product: r.product.name, rating: r.rating, comment: r.comment, createdAt: r.createdAt })),
      notes: [
        'Dados do cartão nunca passam pela loja: ficam com o Mercado Pago.',
        'Endereços de entrega também são enviados ao Melhor Envio e à transportadora para gerar a etiqueta.',
      ],
    };
  }

  /**
   * Exclui a conta: apaga os dados pessoais e encerra todas as sessões.
   * Os pedidos continuam no banco, sem nada que identifique a pessoa, porque a
   * loja precisa deles para contabilidade (LGPD, art. 16, I).
   */
  async delete(userId: string, password: string) {
    const user = await this.confirmPassword(userId, password);
    // Admin excluído deixaria a loja sem ninguém no painel (e apagaria a autoria da auditoria).
    if (user.role === 'ADMIN') {
      throw new ForbiddenException('Contas de administrador não podem ser excluídas pelo site.');
    }

    const inProgress = await this.prisma.order.count({
      where: {
        userId,
        OR: [{ status: { in: ['PAID', 'SHIPPED'] } }, { status: 'PENDING', paymentId: { not: null } }],
      },
    });
    if (inProgress) {
      throw new ConflictException(
        'Você tem pedidos em andamento. A conta pode ser excluída depois que eles forem entregues.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Pedidos não pagos: cancela e devolve o estoque.
      const unpaid = await tx.order.findMany({
        where: { userId, status: 'PENDING', paymentId: null },
        include: { items: true },
      });
      for (const order of unpaid) {
        const { count } = await tx.order.updateMany({
          where: { id: order.id, status: 'PENDING', paymentId: null },
          data: { status: 'CANCELLED' },
        });
        if (!count) continue;
        for (const item of order.items) {
          await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
        }
      }

      await tx.orderAddress.deleteMany({ where: { order: { userId } } });
      await tx.order.updateMany({ where: { userId }, data: { shippingSummary: null } });
      await tx.address.deleteMany({ where: { userId } });
      await tx.review.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: {
          name: 'Conta excluída',
          email: `excluida-${userId}@conta-excluida.invalid`,
          // Hash de uma senha aleatória descartada: ninguém mais entra nesta conta.
          passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 4),
          emailVerifiedAt: null,
          verificationTokenHash: null,
          verificationTokenExpires: null,
          passwordResetTokenHash: null,
          passwordResetExpires: null,
          tokenVersion: { increment: 1 },
          totpSecretEnc: null,
          totpPendingSecretEnc: null,
          totpEnabledAt: null,
          totpRecoveryHashes: [],
          deletedAt: new Date(),
        },
      });
    });

    // Confirmação para o e-mail antigo (último uso dele).
    try {
      await this.mail.sendAccountDeleted(user.email, user.name);
    } catch (error) {
      this.logger.error('Falha ao enviar confirmação de exclusão de conta', error as Error);
    }
    return { deleted: true };
  }
}
