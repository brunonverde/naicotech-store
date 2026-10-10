import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateReviewDto) {
    // Só quem comprou (pedido pago, enviado ou entregue) pode avaliar o produto.
    const purchase = await this.prisma.order.findFirst({
      where: {
        userId,
        status: { in: ['PAID', 'SHIPPED', 'DELIVERED'] },
        items: { some: { productId: dto.productId } },
      },
    });
    if (!purchase) {
      throw new ForbiddenException('Somente compradores podem avaliar este produto');
    }

    const existing = await this.prisma.review.findUnique({
      where: { userId_productId: { userId, productId: dto.productId } },
    });
    if (existing) throw new ConflictException('Você já avaliou este produto');

    return this.prisma.review.create({
      data: {
        userId,
        productId: dto.productId,
        rating: dto.rating,
        comment: dto.comment,
      },
    });
  }

  // Rota pública: o nome completo de quem comprou não sai do servidor, só "Ana S.".
  async findByProduct(productId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { productId },
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        user: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return reviews.map((r) => ({ ...r, user: { name: displayName(r.user.name) } }));
  }

  // Só o autor apaga pela rota de cliente. Moderação é pelo painel (DELETE /admin/reviews/:id),
  // que exige a verificação em duas etapas e fica na auditoria.
  async remove(id: string, userId: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Avaliação não encontrada');
    if (review.userId !== userId) {
      throw new ForbiddenException('Acesso negado');
    }
    await this.prisma.review.delete({ where: { id } });
    return { deleted: true };
  }
}

/** "Ana Souza Lima" → "Ana L."; um nome só fica como está. */
export function displayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}
