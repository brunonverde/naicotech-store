import { IsEmail, IsString, Length } from 'class-validator';

export class VerifyEmailDto {
  @IsString()
  @Length(20, 200)
  token: string;
}

export class ResendVerificationDto {
  @IsEmail()
  email: string;
}
