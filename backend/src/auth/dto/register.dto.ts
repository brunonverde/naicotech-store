import { Equals, IsEmail, IsString, Length } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Length(2, 100)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @Length(8, 72)
  password: string;

  // Aceite dos Termos de Uso e da Política de Privacidade (registrado com data).
  @Equals(true, { message: 'É preciso aceitar os Termos de Uso e a Política de Privacidade' })
  acceptTerms: boolean;
}
