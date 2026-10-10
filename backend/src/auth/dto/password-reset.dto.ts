import { IsEmail, IsString, Length } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @Length(20, 200)
  token: string;

  // Mesmas regras do cadastro (72 é o limite do bcrypt).
  @IsString()
  @Length(8, 72)
  password: string;
}
