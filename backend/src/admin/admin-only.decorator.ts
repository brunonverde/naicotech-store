import { applyDecorators, UseGuards, UseInterceptors } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminStepUpGuard } from './admin-step-up.guard';
import { AuditInterceptor } from './audit.interceptor';

/**
 * Rota do painel: precisa estar logado, ser ADMIN e ter passado pela verificação
 * em duas etapas nos últimos 30 minutos. Toda alteração fica registrada na auditoria.
 */
export const AdminOnly = () =>
  applyDecorators(
    Roles('ADMIN'),
    UseGuards(JwtAuthGuard, RolesGuard, AdminStepUpGuard),
    UseInterceptors(AuditInterceptor),
  );
