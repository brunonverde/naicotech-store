import {
  ArrayMaxSize,
  IsArray,
  IsUrl,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Condition } from '../../generated/prisma/enums';

export class CreateProductDto {
  @IsString()
  @Length(2, 150)
  name: string;

  @IsString()
  @MaxLength(2000)
  description: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price: number;

  @IsEnum(Condition)
  condition: Condition;

  @IsInt()
  @Min(0)
  stock: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  // Só https: bloqueia javascript:, data: e http (conteúdo misto).
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  images?: string[];

  @IsUUID()
  categoryId: string;

  // Pacote pronto para envio (caixa + proteção). Limites dos Correios: 30 kg, 100 cm por lado.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30_000)
  weightGrams?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  lengthCm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  widthCm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  heightCm?: number;
}
