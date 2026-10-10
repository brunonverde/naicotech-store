import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsPositive,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { AddressDto } from '../../shipping/address';

export class OrderItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  @Max(99)
  quantity: number;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  // Serviço de frete escolhido (ID do Melhor Envio). O preço é recotado no servidor.
  @IsInt()
  @IsPositive()
  shippingServiceId: number;

  // Endereço salvo OU endereço novo (um dos dois).
  @ValidateIf((o: CreateOrderDto) => !o.address)
  @IsUUID()
  addressId?: string;

  @ValidateIf((o: CreateOrderDto) => !o.addressId)
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  // Consentimento explícito para guardar o endereço novo para as próximas compras.
  @IsOptional()
  @IsBoolean()
  saveAddress?: boolean;
}
