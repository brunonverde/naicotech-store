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
    // Só quem comprou (pedido PAID) pode avaliar o produto.
    const purchase = await this.prisma.order.findFirst({
      where: {
        userId,
        status: 'PAID',
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

  findByProduct(productId: string) {
    return this.prisma.review.findMany({
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
  }

  async remove(id: string, userId: string, role: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Avaliação não encontrada');
    if (review.userId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('Acesso negado');
    }
    await this.prisma.review.delete({ where: { id } });
    return { deleted: true };
  }
}
