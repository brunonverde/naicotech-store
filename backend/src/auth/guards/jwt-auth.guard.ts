import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { SESSION_COOKIE } from '../session';

export interface JwtPayload {
  sub: string;
  ver: number;
  // 'session' = login normal; 'admin' = sessão do painel (após a 2ª etapa). Um não vale pelo outro.
  typ: 'session' | 'admin';
}

export interface SessionUser {
  sub: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'CUSTOMER';
}

// sessionVersion: tokenVersion atual da conta (usado pela sessão de admin; não vai para a resposta).
export type AuthenticatedRequest = Request & { user: SessionUser; sessionVersion?: number };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token: unknown = request.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || !token) {
      throw new UnauthorizedException('Faça login para continuar');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Sessão inválida ou expirada');
    }

    // Papel e status vêm do banco a cada requisição, não do token: rebaixar um
    // admin ou sair da conta vale na hora, sem esperar o token expirar.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        tokenVersion: true,
        emailVerifiedAt: true,
      },
    });
    if (payload.typ !== 'session') {
      throw new UnauthorizedException('Sessão inválida ou expirada');
    }
    if (!user || user.tokenVersion !== payload.ver || !user.emailVerifiedAt) {
      throw new UnauthorizedException('Sessão inválida ou expirada');
    }

    request.user = { sub: user.id, name: user.name, email: user.email, role: user.role };
    request.sessionVersion = user.tokenVersion;
    return true;
  }
}
