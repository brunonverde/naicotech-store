import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Request } from 'express';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { encryptIp } from '../security/ip';

// Marco Civil da Internet (art. 15): registros de acesso por 6 meses. Depois, o IP é apagado.
export const IP_RETENTION_MS = 183 * 24 * 60 * 60 * 1000;
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuditService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      this.purgeOldIps().catch((error) => this.logger.error('Falha ao apagar IPs antigos', error as Error));
    }, PURGE_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async log(
    request: Request & { user?: { sub: string } },
    action: string,
    extra: { target?: string; details?: Record<string, unknown>; userId?: string } = {},
  ) {
    const userId = extra.userId ?? request.user?.sub;
    if (!userId) return;
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          userId,
          action,
          target: extra.target,
          details: extra.details as Prisma.InputJsonValue | undefined,
          ipEnc: request.ip ? encryptIp(request.ip) : null,
        },
      });
    } catch (error) {
      this.logger.error(`Falha ao registrar auditoria (${action})`, error as Error);
    }
  }

  async purgeOldIps() {
    const { count } = await this.prisma.adminAuditLog.updateMany({
      where: { ipEnc: { not: null }, createdAt: { lt: new Date(Date.now() - IP_RETENTION_MS) } },
      data: { ipEnc: null },
    });
    if (count) this.logger.log(`IP apagado de ${count} registro(s) de auditoria antigos`);
    return count;
  }
}
