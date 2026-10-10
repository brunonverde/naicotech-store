import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Equals, IsString, Length } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { clearSessionCookie } from '../auth/session';
import { AccountService } from './account.service';

class ConfirmPasswordDto {
  @IsString()
  @Length(1, 72)
  password: string;
}

class DeleteAccountDto extends ConfirmPasswordDto {
  // Digitar "EXCLUIR" evita exclusão por clique acidental.
  @Equals('EXCLUIR', { message: 'Digite EXCLUIR para confirmar' })
  confirm: string;
}

// Poucas tentativas: a senha é pedida de novo e não pode virar alvo de força bruta.
const STRICT = { short: { limit: 5, ttl: 60_000 }, long: { limit: 20, ttl: 3_600_000 } };

@Controller('account')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(private readonly account: AccountService) {}

  // POST (e não GET) para a senha ir no corpo, nunca na URL/logs.
  @Post('export')
  @HttpCode(200)
  @Throttle(STRICT)
  async export(@Req() req: AuthenticatedRequest, @Body() dto: ConfirmPasswordDto, @Res({ passthrough: true }) res: Response) {
    // Dados pessoais: o navegador não deve guardar cópia em cache.
    res.setHeader('Cache-Control', 'no-store');
    return this.account.export(req.user.sub, dto.password);
  }

  @Post('delete')
  @HttpCode(200)
  @Throttle(STRICT)
  async delete(@Req() req: AuthenticatedRequest, @Body() dto: DeleteAccountDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.account.delete(req.user.sub, dto.password);
    clearSessionCookie(res);
    return result;
  }
}
