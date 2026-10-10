import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ADMIN_SESSION_TTL_SECONDS } from '../auth/session';
import { AuditService } from './audit.service';
import { decryptSecret, encryptSecret } from './secret-box';
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  normalizeRecoveryCode,
  otpauthUri,
  verifyTotp,
} from './totp';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

type Req = Request & { user: { sub: string } };

@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async status(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      enabled: !!user.totpEnabledAt,
      lockedUntil: user.totpLockedUntil && user.totpLockedUntil > new Date() ? user.totpLockedUntil : null,
      recoveryCodesLeft: user.totpRecoveryHashes.length,
    };
  }

  // 1º passo do cadastro: confirma a senha e gera um segredo (ainda pendente).
  async startSetup(req: Req, password: string) {
    const user = await this.requirePassword(req.user.sub, password);
    if (user.totpEnabledAt) throw new ConflictException('A verificação em duas etapas já está ativa');

    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpPendingSecretEnc: encryptSecret(secret) },
    });
    await this.audit.log(req, '2FA: cadastro iniciado');
    return { secret, otpauthUri: otpauthUri(secret, user.email) };
  }

  // 2º passo: o código do app prova que o autenticador foi configurado certo.
  async enable(req: Req, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    if (user.totpEnabledAt) throw new ConflictException('A verificação em duas etapas já está ativa');
    if (!user.totpPendingSecretEnc) throw new BadRequestException('Comece o cadastro do autenticador de novo');
    this.assertNotLocked(user.totpLockedUntil);

    const secret = decryptSecret(user.totpPendingSecretEnc);
    const step = verifyTotp(secret, code, null);
    if (step === null) {
      await this.registerFailure(req, user.id, user.totpFailedAttempts, user.email, user.name);
      throw new UnauthorizedException('Código incorreto. Confira a hora do celular e tente de novo.');
    }

    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        totpSecretEnc: user.totpPendingSecretEnc,
        totpPendingSecretEnc: null,
        totpEnabledAt: new Date(),
        totpLastStep: step,
        totpFailedAttempts: 0,
        totpLockedUntil: null,
        totpRecoveryHashes: recoveryCodes.map(hashRecoveryCode),
      },
    });
    await this.audit.log(req, '2FA: ativada');
    this.alert(user.email, user.name, 'Verificação em duas etapas ativada', [
      'A verificação em duas etapas foi ativada na sua conta de administrador.',
    ]);
    return { recoveryCodes, adminToken: await this.adminToken(user.id, user.tokenVersion) };
  }

  // Login no painel: código de 6 dígitos do app ou um código de recuperação.
  async verify(req: Req, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    if (!user.totpEnabledAt || !user.totpSecretEnc) {
      throw new BadRequestException('Configure a verificação em duas etapas primeiro');
    }
    this.assertNotLocked(user.totpLockedUntil);

    const clean = code.trim();
    if (/^\d{6}$/.test(clean)) {
      const step = verifyTotp(decryptSecret(user.totpSecretEnc), clean, user.totpLastStep);
      if (step !== null) {
        // Condicional: dois envios simultâneos do mesmo código não passam os dois.
        const { count } = await this.prisma.user.updateMany({
          where: {
            id: user.id,
            OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
          },
          data: { totpLastStep: step, totpFailedAttempts: 0, totpLockedUntil: null },
        });
        if (count === 1) {
          await this.audit.log(req, '2FA: acesso ao painel');
          return { adminToken: await this.adminToken(user.id, user.tokenVersion) };
        }
      }
    } else {
      const hash = hashRecoveryCode(clean);
      if (normalizeRecoveryCode(clean).length === 10 && user.totpRecoveryHashes.includes(hash)) {
        const remaining = user.totpRecoveryHashes.filter((h) => h !== hash);
        const { count } = await this.prisma.user.updateMany({
          where: { id: user.id, totpRecoveryHashes: { has: hash } },
          data: { totpRecoveryHashes: remaining, totpFailedAttempts: 0, totpLockedUntil: null },
        });
        if (count === 1) {
          await this.audit.log(req, '2FA: acesso com código de recuperação', {
            details: { codigosRestantes: remaining.length },
          });
          this.alert(user.email, user.name, 'Código de recuperação usado', [
            `Um código de recuperação foi usado para entrar no painel. Restam ${remaining.length}.`,
            'Se não foi você, troque sua senha e reconfigure o autenticador imediatamente.',
          ]);
          return { adminToken: await this.adminToken(user.id, user.tokenVersion), recoveryCodesLeft: remaining.length };
        }
      }
    }

    await this.registerFailure(req, user.id, user.totpFailedAttempts, user.email, user.name);
    throw new UnauthorizedException('Código incorreto');
  }

  // Celular trocado/perdido: apaga o autenticador atual para cadastrar outro.
  // Exige sessão de admin já verificada + senha.
  async reset(req: Req, password: string) {
    const user = await this.requirePassword(req.user.sub, password);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        totpSecretEnc: null,
        totpPendingSecretEnc: null,
        totpEnabledAt: null,
        totpLastStep: null,
        totpRecoveryHashes: [],
      },
    });
    await this.audit.log(req, '2FA: autenticador removido para reconfigurar');
    this.alert(user.email, user.name, 'Autenticador removido', [
      'O autenticador da sua conta de administrador foi removido para ser configurado de novo.',
      'Se não foi você, troque sua senha imediatamente.',
    ]);
  }

  async regenerateRecoveryCodes(req: Req, password: string) {
    const user = await this.requirePassword(req.user.sub, password);
    if (!user.totpEnabledAt) throw new BadRequestException('Verificação em duas etapas não está ativa');
    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpRecoveryHashes: recoveryCodes.map(hashRecoveryCode) },
    });
    await this.audit.log(req, '2FA: novos códigos de recuperação gerados');
    return { recoveryCodes };
  }

  private async requirePassword(userId: string, password: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Senha incorreta');
    }
    return user;
  }

  private assertNotLocked(lockedUntil: Date | null) {
    if (lockedUntil && lockedUntil > new Date()) {
      const minutes = Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000);
      throw new HttpException(
        { statusCode: 423, code: 'ADMIN_2FA_LOCKED', message: `Muitas tentativas erradas. Tente de novo em ${minutes} min.` },
        HttpStatus.LOCKED,
      );
    }
  }

  // 5 erros seguidos bloqueiam a 2ª etapa por 15 min (por conta, além do limite por IP).
  private async registerFailure(req: Req, userId: string, previous: number, email: string, name: string) {
    const attempts = previous + 1;
    const lock = attempts >= MAX_FAILED_ATTEMPTS;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpFailedAttempts: lock ? 0 : attempts,
        totpLockedUntil: lock ? new Date(Date.now() + LOCK_MS) : undefined,
      },
    });
    await this.audit.log(req, lock ? '2FA: bloqueada por tentativas erradas' : '2FA: código incorreto', {
      details: { tentativa: attempts },
    });
    if (lock) {
      this.alert(email, name, 'Painel bloqueado por tentativas erradas', [
        'Houve 5 tentativas erradas do código de verificação no painel de admin. O acesso ficou bloqueado por 15 minutos.',
        'Se não foi você, alguém tem a sua senha: troque-a imediatamente.',
      ]);
    }
  }

  private adminToken(userId: string, tokenVersion: number) {
    return this.jwtService.signAsync(
      { sub: userId, ver: tokenVersion, typ: 'admin' },
      { expiresIn: ADMIN_SESSION_TTL_SECONDS },
    );
  }

  private alert(email: string, name: string, subject: string, paragraphs: string[]) {
    this.mail.sendSecurityAlert(email, name, subject, paragraphs).catch(() => undefined);
  }
}
