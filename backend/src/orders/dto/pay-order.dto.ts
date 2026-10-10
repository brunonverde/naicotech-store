import { IsIn, IsInt, IsString, Length, Matches, Max, Min } from 'class-validator';

export const CARD_TYPES = ['credit_card', 'debit_card'] as const;
export type CardType = (typeof CARD_TYPES)[number];

export class PayOrderDto {
  @IsString()
  @Length(10, 200)
  cardToken: string;

  // Bandeira identificada pelo Mercado Pago no front (ex.: visa, master, elo, debvisa).
  @IsString()
  @Matches(/^[a-z_]{2,30}$/)
  paymentMethodId: string;

  @IsIn(CARD_TYPES)
  paymentType: CardType;

  @IsInt()
  @Min(1)
  @Max(12)
  installments: number;
}
