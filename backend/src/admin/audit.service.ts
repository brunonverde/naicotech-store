import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

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
          ip: request.ip,
        },
      });
    } catch (error) {
      this.logger.error(`Falha ao registrar auditoria (${action})`, error as Error);
    }
  }
}
