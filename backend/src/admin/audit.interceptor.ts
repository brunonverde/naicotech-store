import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { tap } from 'rxjs';
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { AuditService } from './audit.service';

const SENSITIVE = /password|senha|code|token|secret/i;

// Registra toda ação de admin que altera dados, depois que ela dá certo.
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.method === 'GET') return next.handle();

    const route = (request.route as { path?: string } | undefined)?.path ?? request.path;
    const body = Object.fromEntries(
      Object.entries((request.body ?? {}) as Record<string, unknown>).map(([k, v]) => [
        k,
        SENSITIVE.test(k) ? '[omitido]' : v,
      ]),
    );
    return next.handle().pipe(
      tap(() => {
        void this.audit.log(request, `${request.method} ${route}`, {
          target: (request.params as Record<string, string>)?.id,
          details: Object.keys(body).length ? body : undefined,
        });
      }),
    );
  }
}
