import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { clearAdminCookie, setAdminCookie } from '../auth/session';
import { OrderStatus } from '../generated/prisma/enums';
import { AdminOnly } from './admin-only.decorator';
import { AdminService } from './admin.service';
import {
  AdminVerifyDto,
  GenerateLabelDto,
  PasswordConfirmDto,
  TotpCodeDto,
  UpdateOrderStatusDto,
} from './dto/two-factor.dto';
import { TwoFactorService } from './two-factor.service';
import { ShipmentsService } from '../shipping/shipments.service';

const MINUTE = 60_000;
const HOUR = 3_600_000;
const STRICT = { short: { limit: 5, ttl: MINUTE }, long: { limit: 20, ttl: HOUR } };
const VERY_STRICT = { short: { limit: 3, ttl: MINUTE }, long: { limit: 10, ttl: HOUR } };

@Controller('admin')
export class AdminController {
  constructor(
    private readonly twoFactor: TwoFactorService,
    private readonly admin: AdminService,
    private readonly shipments: ShipmentsService,
  ) {}

  // ---------- Verificação em duas etapas (exige login de ADMIN) ----------

  @Get('2fa/status')
  @Roles('ADMIN')
  @UseGuards(JwtAuthGuard, RolesGuard)
  status(@Req() req: AuthenticatedRequest) {
    return this.twoFactor.status(req.user.sub);
  }

  @Post('2fa/setup')
  @HttpCode(200)
  @Roles('ADMIN')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Throttle(STRICT)
  setup(@Req() req: AuthenticatedRequest, @Body() dto: PasswordConfirmDto) {
    return this.twoFactor.startSetup(req, dto.password);
  }

  @Post('2fa/enable')
  @HttpCode(200)
  @Roles('ADMIN')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Throttle(STRICT)
  async enable(
    @Req() req: AuthenticatedRequest,
    @Body() dto: TotpCodeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { recoveryCodes, adminToken } = await this.twoFactor.enable(req, dto.code);
    setAdminCookie(res, adminToken);
    return { recoveryCodes };
  }

  @Post('2fa/verify')
  @HttpCode(200)
  @Roles('ADMIN')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Throttle(STRICT)
  async verify(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AdminVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { adminToken, recoveryCodesLeft } = await this.twoFactor.verify(req, dto.code);
    setAdminCookie(res, adminToken);
    return { ok: true, recoveryCodesLeft };
  }

  // Sai só do painel (continua logado na loja).
  @Post('2fa/end')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  end(@Res({ passthrough: true }) res: Response) {
    clearAdminCookie(res);
    return { ok: true };
  }

  // Celular trocado/perdido (depois de entrar com um código de recuperação).
  @Post('2fa/reset')
  @HttpCode(200)
  @AdminOnly()
  @Throttle(VERY_STRICT)
  async reset(
    @Req() req: AuthenticatedRequest,
    @Body() dto: PasswordConfirmDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.twoFactor.reset(req, dto.password);
    clearAdminCookie(res);
    return { ok: true };
  }

  @Post('2fa/recovery-codes')
  @HttpCode(200)
  @AdminOnly()
  @Throttle(VERY_STRICT)
  recoveryCodes(@Req() req: AuthenticatedRequest, @Body() dto: PasswordConfirmDto) {
    return this.twoFactor.regenerateRecoveryCodes(req, dto.password);
  }

  // ---------- Painel (exige a 2ª etapa) ----------

  @Get('products')
  @AdminOnly()
  products() {
    return this.admin.products();
  }

  @Get('orders')
  @AdminOnly()
  orders(@Query('status') status?: string) {
    const valid = Object.values(OrderStatus).find((s) => s === status);
    return this.admin.orders(valid);
  }

  @Patch('orders/:id/status')
  @AdminOnly()
  updateOrderStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.admin.updateOrderStatus(id, dto.status);
  }

  // ---------- Envio (Melhor Envio) ----------

  // Compra a etiqueta com o saldo da carteira do Melhor Envio.
  @Post('orders/:id/label')
  @HttpCode(200)
  @AdminOnly()
  @Throttle(STRICT)
  generateLabel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GenerateLabelDto) {
    return this.shipments.generateLabel(id, dto.invoiceKey);
  }

  @Get('shipping/settings')
  @AdminOnly()
  shippingSettings() {
    return this.shipments.settings();
  }

  // POST (e não GET) para ficar na auditoria: a etiqueta tem o endereço do cliente.
  @Post('orders/:id/label/print')
  @HttpCode(200)
  @AdminOnly()
  printLabel(@Param('id', ParseUUIDPipe) id: string) {
    return this.shipments.printUrl(id);
  }

  // Endereço completo só sob demanda, um pedido por vez, e registrado na auditoria.
  @Post('orders/:id/address')
  @HttpCode(200)
  @AdminOnly()
  @Throttle({ short: { limit: 20, ttl: MINUTE }, long: { limit: 200, ttl: HOUR } })
  orderAddress(@Param('id', ParseUUIDPipe) id: string) {
    return this.shipments.orderAddress(id);
  }

  @Post('shipments/sync')
  @HttpCode(200)
  @AdminOnly()
  @Throttle(STRICT)
  syncShipments() {
    return this.shipments.syncTracking();
  }

  @Get('audit-log')
  @AdminOnly()
  auditLog() {
    return this.admin.auditLog();
  }
}
