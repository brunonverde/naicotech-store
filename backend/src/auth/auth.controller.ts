import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResendVerificationDto, VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedRequest } from './guards/jwt-auth.guard';
import { clearSessionCookie, setSessionCookie } from './session';

const MINUTE = 60_000;
const HOUR = 3_600_000;

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ short: { limit: 3, ttl: MINUTE }, long: { limit: 10, ttl: HOUR } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // Limite por IP contra força bruta de senha.
  @Post('login')
  @HttpCode(200)
  @Throttle({ short: { limit: 5, ttl: MINUTE }, long: { limit: 30, ttl: HOUR } })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.authService.login(dto);
    setSessionCookie(res, token);
    return { user };
  }

  @Post('verify-email')
  @HttpCode(200)
  @Throttle({ short: { limit: 10, ttl: MINUTE }, long: { limit: 50, ttl: HOUR } })
  async verifyEmail(@Body() dto: VerifyEmailDto, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.authService.verifyEmail(dto.token);
    setSessionCookie(res, token);
    return { user };
  }

  @Post('resend-verification')
  @HttpCode(200)
  @Throttle({ short: { limit: 3, ttl: MINUTE }, long: { limit: 10, ttl: HOUR } })
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }

  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ short: { limit: 3, ttl: MINUTE }, long: { limit: 10, ttl: HOUR } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ short: { limit: 5, ttl: MINUTE }, long: { limit: 20, ttl: HOUR } })
  async resetPassword(@Body() dto: ResetPasswordDto, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.authService.resetPassword(dto.token, dto.password);
    setSessionCookie(res, token);
    return { user };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(req.user.sub);
    clearSessionCookie(res);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: AuthenticatedRequest) {
    return req.user;
  }
}
