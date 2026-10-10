import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID, Matches, ValidateNested } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard';
import { OrderItemDto } from '../orders/dto/create-order.dto';
import { AddressDto } from './address';
import { AddressesService } from './addresses.service';
import { ShippingService } from './shipping.service';

class QuoteItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}

export class QuoteByCepDto extends QuoteItemsDto {
  @Matches(/^\d{5}-?\d{3}$/, { message: 'CEP precisa ter 8 dígitos' })
  postalCode: string;
}

export class QuoteByAddressDto extends QuoteItemsDto {
  @IsUUID()
  addressId: string;
}

// Cada cotação chama a API do Melhor Envio: limite próprio para não ser usada como proxy.
const QUOTE_LIMIT = { short: { limit: 20, ttl: 60_000 }, long: { limit: 300, ttl: 3_600_000 } };

@Controller('shipping')
export class ShippingController {
  constructor(
    private readonly shipping: ShippingService,
    private readonly addresses: AddressesService,
  ) {}

  // Público: calcular o frete na página do produto não exige login.
  @Post('quote')
  @HttpCode(200)
  @Throttle(QUOTE_LIMIT)
  quote(@Body() dto: QuoteByCepDto) {
    return this.shipping.quote(dto.postalCode.replace('-', ''), dto.items);
  }

  // Cotação para um endereço salvo: o CEP completo fica só no servidor.
  @Post('quote/address')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle(QUOTE_LIMIT)
  async quoteForAddress(@Req() req: AuthenticatedRequest, @Body() dto: QuoteByAddressDto) {
    const address = await this.addresses.getOwned(req.user.sub, dto.addressId);
    return this.shipping.quote(address.postalCode, dto.items);
  }

  @Get('cep/:cep')
  @Throttle({ short: { limit: 20, ttl: 60_000 }, long: { limit: 200, ttl: 3_600_000 } })
  cep(@Param('cep') cep: string) {
    const digits = cep.replace('-', '');
    if (!/^\d{8}$/.test(digits)) throw new BadRequestException('CEP precisa ter 8 dígitos');
    return this.shipping.lookupCep(digits);
  }
}

@Controller('addresses')
@UseGuards(JwtAuthGuard)
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.addresses.list(req.user.sub);
  }

  @Post()
  @Throttle({ short: { limit: 5, ttl: 60_000 }, long: { limit: 30, ttl: 3_600_000 } })
  create(@Req() req: AuthenticatedRequest, @Body() dto: AddressDto) {
    return this.addresses.create(req.user.sub, dto);
  }

  @Delete(':id')
  remove(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.addresses.remove(req.user.sub, id);
  }
}
