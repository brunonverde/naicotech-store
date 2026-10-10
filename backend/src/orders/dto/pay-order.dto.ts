import { IsString, Length } from 'class-validator';

export class PayOrderDto {
  @IsString()
  @Length(10, 200)
  cardToken: string;
}
