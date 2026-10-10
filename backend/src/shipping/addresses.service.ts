import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  addressSummary,
  decryptSavedAddress,
  encryptSavedAddress,
  normalizeAddress,
} from './address';
import type { AddressDto, ShippingAddress } from './address';

export const MAX_SAVED_ADDRESSES = 5;

@Injectable()
export class AddressesService {
  private readonly logger = new Logger(AddressesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Lista só a versão mascarada: o endereço completo nunca volta para o navegador.
  async list(userId: string) {
    const rows = await this.prisma.address.findMany({
      where: { userId },
      select: { id: true, dataEnc: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.flatMap((row) => {
      try {
        return [{ id: row.id, createdAt: row.createdAt, ...addressSummary(decryptSavedAddress(userId, row.dataEnc)) }];
      } catch {
        // Não abre (chave trocada ou dado adulterado): esconde em vez de quebrar a tela.
        this.logger.error(`Endereço ${row.id} não pôde ser descriptografado`);
        return [];
      }
    });
  }

  async create(userId: string, dto: AddressDto) {
    const count = await this.prisma.address.count({ where: { userId } });
    if (count >= MAX_SAVED_ADDRESSES) {
      throw new ConflictException(`Você pode salvar até ${MAX_SAVED_ADDRESSES} endereços. Apague um para adicionar outro.`);
    }
    const address = normalizeAddress(dto);
    const row = await this.prisma.address.create({
      data: { userId, dataEnc: encryptSavedAddress(userId, address) },
      select: { id: true, createdAt: true },
    });
    return { ...row, ...addressSummary(address) };
  }

  async remove(userId: string, id: string) {
    // userId no filtro: ninguém apaga endereço de outra pessoa (e recebe 404, não 403).
    const { count } = await this.prisma.address.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Endereço não encontrado');
    return { deleted: true };
  }

  /** Uso interno (cotação e pedido): endereço completo de um endereço salvo do próprio usuário. */
  async getOwned(userId: string, id: string): Promise<ShippingAddress> {
    const row = await this.prisma.address.findFirst({ where: { id, userId }, select: { dataEnc: true } });
    if (!row) throw new NotFoundException('Endereço não encontrado');
    try {
      return decryptSavedAddress(userId, row.dataEnc);
    } catch {
      this.logger.error(`Endereço ${id} não pôde ser descriptografado`);
      throw new NotFoundException('Endereço não encontrado');
    }
  }
}
