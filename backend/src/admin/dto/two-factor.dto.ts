import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

export class PasswordConfirmDto {
  @IsString()
  @Length(1, 72)
  password: string;
}

export class TotpCodeDto {
  @Matches(/^\d{6}$/, { message: 'O código tem 6 dígitos' })
  code: string;
}

// Código do app (6 dígitos) ou código de recuperação (XXXXX-XXXXX).
export class AdminVerifyDto {
  @IsString()
  @Length(6, 20)
  @Matches(/^(\d{6}|[A-Za-z2-7]{5}-?[A-Za-z2-7]{5})$/, { message: 'Código inválido' })
  code: string;
}

export class UpdateOrderStatusDto {
  @IsIn(['SHIPPED', 'DELIVERED'])
  status: 'SHIPPED' | 'DELIVERED';
}

export class GenerateLabelDto {
  // Chave de acesso da NF-e (44 dígitos), só no envio comercial (loja com CNPJ).
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @Matches(/^\d{44}$/, { message: 'A chave da NF-e tem 44 dígitos' })
  invoiceKey?: string;
}
