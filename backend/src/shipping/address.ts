import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, Matches, Validate } from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';
import { ValidatorConstraint } from 'class-validator';
import { SecretBox } from '../security/secret-box';

export const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const;

const digitsOnly = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/\D/g, '') : value;
const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
// Letras (com acento), números e pontuação comum de endereço. Bloqueia <, >, etc.
const ADDRESS_TEXT = /^[\p{L}\p{N} .,'ºª°/()-]+$/u;

export function isValidCpf(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

@ValidatorConstraint({ name: 'cpf' })
class CpfConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isValidCpf(value);
  }
  defaultMessage() {
    return 'CPF inválido';
  }
}

export class AddressDto {
  @Transform(trimmed)
  @IsString()
  @Length(3, 100)
  @Matches(/^[\p{L} .'-]+$/u, { message: 'Nome do destinatário com caracteres inválidos' })
  recipientName: string;

  // Exigido pelas transportadoras na declaração de conteúdo da etiqueta.
  @Transform(digitsOnly)
  @Validate(CpfConstraint)
  document: string;

  @Transform(digitsOnly)
  @Matches(/^\d{10,11}$/, { message: 'Telefone precisa ter DDD + número' })
  phone: string;

  @Transform(digitsOnly)
  @Matches(/^\d{8}$/, { message: 'CEP precisa ter 8 dígitos' })
  postalCode: string;

  @Transform(trimmed)
  @IsString()
  @Length(2, 120)
  @Matches(ADDRESS_TEXT, { message: 'Rua com caracteres inválidos' })
  street: string;

  @Transform(trimmed)
  @IsString()
  @Length(1, 10)
  @Matches(/^[\p{L}\p{N} /-]+$/u, { message: 'Número inválido' })
  number: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Length(0, 60)
  @Matches(/^[\p{L}\p{N} .,'ºª°/()-]*$/u, { message: 'Complemento com caracteres inválidos' })
  complement?: string;

  @Transform(trimmed)
  @IsString()
  @Length(2, 60)
  @Matches(ADDRESS_TEXT, { message: 'Bairro com caracteres inválidos' })
  district: string;

  @Transform(trimmed)
  @IsString()
  @Length(2, 60)
  @Matches(ADDRESS_TEXT, { message: 'Cidade com caracteres inválidos' })
  city: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsIn(UFS, { message: 'UF inválida' })
  state: string;
}

export type ShippingAddress = Omit<AddressDto, 'complement'> & { complement: string };

export function normalizeAddress(dto: AddressDto): ShippingAddress {
  return {
    recipientName: dto.recipientName,
    document: dto.document,
    phone: dto.phone,
    postalCode: dto.postalCode,
    street: dto.street,
    number: dto.number,
    complement: dto.complement ?? '',
    district: dto.district,
    city: dto.city,
    state: dto.state,
  };
}

// ---------- Criptografia ----------
// Contextos diferentes para endereço salvo e cópia do pedido: o texto de um não abre no outro.
const box = new SecretBox('ADDRESS_ENCRYPTION_KEY');
const savedContext = (userId: string) => `address:${userId}`;
const orderContext = (orderId: string) => `order-address:${orderId}`;

export const encryptSavedAddress = (userId: string, a: ShippingAddress) =>
  box.encrypt(JSON.stringify(a), savedContext(userId));
export const decryptSavedAddress = (userId: string, enc: string): ShippingAddress =>
  JSON.parse(box.decrypt(enc, savedContext(userId))) as ShippingAddress;

export const encryptOrderAddress = (orderId: string, a: ShippingAddress) =>
  box.encrypt(JSON.stringify(a), orderContext(orderId));
export const decryptOrderAddress = (orderId: string, enc: string): ShippingAddress =>
  JSON.parse(box.decrypt(enc, orderContext(orderId))) as ShippingAddress;

// ---------- Exibição mascarada ----------
// A API nunca devolve o endereço completo para o navegador: só o suficiente para
// a pessoa reconhecer qual é. Se a sessão for roubada ou houver XSS, não vaza tudo.
const maskWord = (text: string, visible: number) =>
  text.length <= visible ? text : `${text.slice(0, visible)}•••`;

export const maskCep = (cep: string) => `${cep.slice(0, 5)}-•••`;

export function addressSummary(a: ShippingAddress) {
  return {
    recipient: a.recipientName.split(' ')[0],
    line: `${maskWord(a.street, 6)}, ${maskWord(a.number, 1)}`,
    city: `${a.city}/${a.state}`,
    postalCode: maskCep(a.postalCode),
  };
}

// Texto guardado em claro no pedido (não identifica a pessoa sozinho).
export const orderShippingSummary = (a: ShippingAddress) =>
  `${a.city}/${a.state} · CEP ${maskCep(a.postalCode)}`;
