import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const BCRYPT_ROUNDS = 12;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

// Usado quando o e-mail não existe, para o login levar o mesmo tempo
// (sem isso, a resposta rápida revelaria quais e-mails têm conta).
const DUMMY_HASH = bcrypt.hashSync('naicotech-dummy-password', BCRYPT_ROUNDS);

const REGISTER_RESPONSE = {
  message:
    'Se o e-mail puder ser usado, enviamos um link de confirmação. Confira sua caixa de entrada.',
};
const RESEND_RESPONSE = {
  message: 'Se houver uma conta pendente com esse e-mail, enviamos um novo link de confirmação.',
};
const FORGOT_RESPONSE = {
  message: 'Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha.',
};
const INVALID_VERIFICATION = 'Link inválido ou expirado. Peça um novo e-mail de confirmação.';
const INVALID_RESET = 'Link inválido ou expirado. Peça um novo link de redefinição de senha.';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function newToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

// Calcula quando o último link foi enviado a partir da validade dele.
function canResend(expires: Date | null, ttlMs: number): boolean {
  const sentAt = expires ? expires.getTime() - ttlMs : 0;
  return Date.now() - sentAt >= RESEND_COOLDOWN_MS;
}

type UserForSession = { id: string; name: string; email: string; role: string; tokenVersion: number };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  // Resposta sempre igual, exista ou não a conta, para não revelar e-mails cadastrados.
  // Quem já tem conta recebe um aviso por e-mail em vez de um erro na tela.
  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    // O hash roda sempre, para o tempo de resposta não denunciar contas existentes.
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      if (existing.emailVerifiedAt) {
        this.deliver('aviso de conta existente', existing.email, () =>
          this.mailService.sendAccountExistsNotice(existing.email, existing.name, this.frontendUrl()),
        );
      } else if (canResend(existing.verificationTokenExpires, VERIFICATION_TTL_MS)) {
        await this.sendVerification(existing.id, existing.email, existing.name);
      }
      return REGISTER_RESPONSE;
    }

    try {
      const user = await this.prisma.user.create({
        data: { name: dto.name.trim(), email, passwordHash, termsAcceptedAt: new Date() },
      });
      await this.sendVerification(user.id, user.email, user.name);
    } catch (error) {
      // P2002: cadastro simultâneo com o mesmo e-mail. Mesma resposta genérica.
      if ((error as { code?: string }).code !== 'P2002') throw error;
    }
    return REGISTER_RESPONSE;
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    const valid = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    // Checado só depois da senha, para não revelar quais e-mails existem.
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Confirme seu e-mail antes de entrar. Enviamos um link para a sua caixa de entrada.',
      });
    }
    return this.createSession(user);
  }

  // Confirma o e-mail e já devolve a sessão (entrada automática).
  async verifyEmail(token: string) {
    const tokenHash = hashToken(token);
    const user = await this.prisma.user.findUnique({
      where: { verificationTokenHash: tokenHash },
    });
    if (!user || !user.verificationTokenExpires || user.verificationTokenExpires < new Date()) {
      throw new BadRequestException(INVALID_VERIFICATION);
    }

    // Condicional no hash: dois cliques simultâneos não confirmam duas vezes.
    const { count } = await this.prisma.user.updateMany({
      where: { id: user.id, verificationTokenHash: tokenHash },
      data: {
        emailVerifiedAt: new Date(),
        verificationTokenHash: null,
        verificationTokenExpires: null,
      },
    });
    if (count === 0) throw new BadRequestException(INVALID_VERIFICATION);
    return this.createSession(user);
  }

  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (
      user &&
      !user.emailVerifiedAt &&
      canResend(user.verificationTokenExpires, VERIFICATION_TTL_MS)
    ) {
      await this.sendVerification(user.id, user.email, user.name);
    }
    return RESEND_RESPONSE;
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (user && canResend(user.passwordResetExpires, PASSWORD_RESET_TTL_MS)) {
      const { token, hash } = newToken();
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetTokenHash: hash,
          passwordResetExpires: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        },
      });
      const link = `${this.frontendUrl()}/redefinir-senha?token=${token}`;
      this.deliver('redefinição de senha', user.email, () =>
        this.mailService.sendPasswordReset(user.email, user.name, link),
      );
    }
    return FORGOT_RESPONSE;
  }

  // Troca a senha, encerra todas as sessões antigas e abre uma nova.
  async resetPassword(token: string, password: string) {
    const tokenHash = hashToken(token);
    const user = await this.prisma.user.findUnique({
      where: { passwordResetTokenHash: tokenHash },
    });
    if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      throw new BadRequestException(INVALID_RESET);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    // Condicional no hash: o link só funciona uma vez, mesmo com cliques simultâneos.
    const { count } = await this.prisma.user.updateMany({
      where: { id: user.id, passwordResetTokenHash: tokenHash },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetExpires: null,
        // Quem abriu o link provou que controla o e-mail.
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        verificationTokenHash: null,
        verificationTokenExpires: null,
        // Derruba todas as sessões abertas (inclusive de quem tiver invadido a conta).
        tokenVersion: { increment: 1 },
      },
    });
    if (count === 0) throw new BadRequestException(INVALID_RESET);

    this.deliver('aviso de senha alterada', user.email, () =>
      this.mailService.sendPasswordChangedNotice(user.email, user.name, this.frontendUrl()),
    );
    const updated = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return this.createSession(updated);
  }

  // Invalida todas as sessões da conta (este e outros dispositivos).
  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  private async createSession(user: UserForSession) {
    const token = await this.jwtService.signAsync({ sub: user.id, ver: user.tokenVersion, typ: 'session' });
    return {
      token,
      user: { sub: user.id, name: user.name, email: user.email, role: user.role },
    };
  }

  private frontendUrl() {
    return process.env.FRONTEND_URL ?? 'http://localhost:5173';
  }

  private async sendVerification(userId: string, email: string, name: string) {
    const { token, hash } = newToken();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        verificationTokenHash: hash,
        verificationTokenExpires: new Date(Date.now() + VERIFICATION_TTL_MS),
      },
    });
    const link = `${this.frontendUrl()}/verificar-email?token=${token}`;
    this.deliver('verificação', email, () => this.mailService.sendEmailVerification(email, name, link));
  }

  // Envio em segundo plano: a resposta da API não espera o SMTP, então o tempo de
  // resposta não denuncia se a conta existe. Falhas ficam no log; a pessoa pode pedir de novo.
  private deliver(kind: string, email: string, send: () => Promise<void>) {
    send().catch((error) =>
      this.logger.error(`Falha ao enviar e-mail de ${kind} para ${email}`, error as Error),
    );
  }
}
