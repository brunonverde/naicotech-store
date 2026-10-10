import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthenticatedRequest, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { ADMIN_COOKIE } from '../auth/session';

export const ADMIN_2FA_REQUIRED = 'ADMIN_2FA_REQUIRED';

/**
 * Exige a sessão de admin (cookie separado, emitido só após a verificação em duas
 * etapas, válido por 30 min). Roda depois do JwtAuthGuard e do RolesGuard.
 * Responde 403 (não 401) para o front pedir o código sem deslogar a pessoa.
 */
@Injectable()
export class AdminStepUpGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token: unknown = request.cookies?.[ADMIN_COOKIE];
    const deny = () =>
      new ForbiddenException({
        statusCode: 403,
        code: ADMIN_2FA_REQUIRED,
        message: 'Confirme o código do autenticador para acessar o painel.',
      });
    if (typeof token !== 'string' || !token) throw deny();

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, { algorithms: ['HS256'] });
    } catch {
      throw deny();
    }
    // Tem que ser da mesma pessoa e da mesma "geração" de sessão (logout/troca de senha invalidam).
    if (
      payload.typ !== 'admin' ||
      payload.sub !== request.user?.sub ||
      payload.ver !== request.sessionVersion
    ) {
      throw deny();
    }
    return true;
  }
}
