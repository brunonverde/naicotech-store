import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { isCommercialShipping, isMelhorEnvioSandbox, NON_COMMERCIAL_INSURANCE_CAP } from '../config/env';
import type { ShippingAddress } from './address';

// Cliente da API do Melhor Envio (https://docs.menv.io). Uma integração só
// cobre Correios (PAC/SEDEX), Jadlog, Loggi, J&T, Azul Cargo etc.

export interface PackageItem {
  id: string;
  quantity: number;
  // Valor segurado: se o pacote extraviar, a transportadora paga isso.
  unitPrice: number;
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export interface MeVolume {
  weight: number;
  dimensions: { height: number; width: number; length: number };
}

export interface MeQuote {
  id: number;
  name: string;
  price?: string;
  custom_price?: string;
  delivery_time?: number;
  custom_delivery_time?: number;
  error?: string;
  company: { id: number; name: string; picture?: string };
  packages?: MeVolume[];
}

export interface MeTracking {
  id: string;
  status: string;
  tracking: string | null;
  melhorenvio_tracking?: string | null;
  paid_at?: string | null;
  generated_at?: string | null;
  posted_at?: string | null;
  delivered_at?: string | null;
}

export interface LabelRequest {
  orderId: string;
  serviceId: number;
  companyId?: number;
  to: ShippingAddress;
  items: (PackageItem & { name: string })[];
  volumes: MeVolume[];
  // Chave da NF-e (44 dígitos), obrigatória no envio comercial.
  invoiceKey?: string;
}

/** Valor segurado do pacote: o total, ou no máximo R$ 1.000 sem nota fiscal. */
export function insuredValue(total: number): number {
  const capped = isCommercialShipping() ? total : Math.min(total, NON_COMMERCIAL_INSURANCE_CAP);
  return Math.floor(capped * 100) / 100;
}

function senderFromEnv(commercial: boolean) {
  const env = (name: string) => process.env[name]?.trim() ?? '';
  const sender = {
    // Com CNPJ, a loja aparece como remetente (CNPJ e inscrição estadual, se houver).
    ...(commercial
      ? {
          company_document: env('SHIPPING_SENDER_CNPJ').replace(/\D/g, ''),
          ...(env('SHIPPING_SENDER_IE') ? { state_register: env('SHIPPING_SENDER_IE') } : {}),
        }
      : {}),
    name: env('SHIPPING_SENDER_NAME'),
    phone: env('SHIPPING_SENDER_PHONE').replace(/\D/g, ''),
    email: env('SHIPPING_SENDER_EMAIL'),
    document: env('SHIPPING_SENDER_DOCUMENT').replace(/\D/g, ''),
    address: env('SHIPPING_SENDER_STREET'),
    number: env('SHIPPING_SENDER_NUMBER'),
    complement: env('SHIPPING_SENDER_COMPLEMENT'),
    district: env('SHIPPING_SENDER_DISTRICT'),
    city: env('SHIPPING_SENDER_CITY'),
    state_abbr: env('SHIPPING_SENDER_STATE').toUpperCase(),
    postal_code: env('SHIPPING_ORIGIN_CEP').replace(/\D/g, ''),
    country_id: 'BR',
  };
  const missing = Object.entries(sender)
    .filter(([key, value]) => key !== 'complement' && !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new ServiceUnavailableException(
      `Dados do remetente incompletos no backend/.env (SHIPPING_SENDER_*): ${missing.join(', ')}`,
    );
  }
  return sender;
}

// SHIPPING_AGENCIES="2=123,9=456": agência de postagem por transportadora
// (a Jadlog e algumas outras exigem escolher onde você vai deixar o pacote).
function agencyFor(companyId?: number): number | undefined {
  const entry = (process.env.SHIPPING_AGENCIES ?? '')
    .split(',')
    .map((pair) => pair.split('=').map((s) => Number(s.trim())))
    .find(([company]) => company === companyId);
  return entry && Number.isInteger(entry[1]) ? entry[1] : undefined;
}

@Injectable()
export class MelhorEnvioClient {
  private readonly logger = new Logger(MelhorEnvioClient.name);
  private readonly baseUrl = isMelhorEnvioSandbox()
    ? 'https://sandbox.melhorenvio.com.br/api/v2/me'
    : 'https://melhorenvio.com.br/api/v2/me';

  calculate(toPostalCode: string, items: PackageItem[]) {
    const services = process.env.SHIPPING_SERVICES?.trim();
    // A cotação usa o mesmo seguro da etiqueta; senão o cliente veria um preço e a etiqueta custaria outro.
    const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const factor = total > 0 ? insuredValue(total) / total : 1;
    return this.request<MeQuote[]>('/shipment/calculate', {
      from: { postal_code: process.env.SHIPPING_ORIGIN_CEP?.replace(/\D/g, '') },
      to: { postal_code: toPostalCode },
      products: items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        // Arredonda para baixo: a soma nunca passa do limite.
        insurance_value: Math.floor(item.unitPrice * factor * 100) / 100,
        weight: item.weightGrams / 1000,
        length: item.lengthCm,
        width: item.widthCm,
        height: item.heightCm,
      })),
      options: { receipt: false, own_hand: false },
      ...(services ? { services } : {}),
    });
  }

  /** 1ª etapa: coloca a etiqueta no carrinho do Melhor Envio (ainda sem pagar). */
  async addToCart(req: LabelRequest): Promise<string> {
    const commercial = isCommercialShipping();
    if (commercial && !/^\d{44}$/.test(req.invoiceKey ?? '')) {
      throw new MelhorEnvioError(400, 'Envio comercial exige a chave da nota fiscal (44 dígitos)', '');
    }
    const from = senderFromEnv(commercial);
    const total = req.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const agency = agencyFor(req.companyId);

    const cart = await this.request<{ id: string }>('/cart', {
      service: req.serviceId,
      ...(agency ? { agency } : {}),
      from,
      to: {
        name: req.to.recipientName,
        phone: req.to.phone,
        document: req.to.document,
        address: req.to.street,
        number: req.to.number,
        complement: req.to.complement,
        district: req.to.district,
        city: req.to.city,
        state_abbr: req.to.state,
        postal_code: req.to.postalCode,
        country_id: 'BR',
      },
      products: req.items.map((i) => ({ name: i.name, quantity: i.quantity, unitary_value: i.unitPrice })),
      volumes: req.volumes.map((v) => ({ ...v.dimensions, weight: v.weight })),
      options: {
        insurance_value: insuredValue(total),
        receipt: false,
        own_hand: false,
        reverse: false,
        // Sem CNPJ: declaração de conteúdo (com o valor real dos produtos acima).
        non_commercial: !commercial,
        ...(commercial ? { invoice: { key: req.invoiceKey } } : {}),
        platform: 'NaicoTech Store',
        tags: [{ tag: req.orderId, url: null }],
      },
    });

    return cart.id;
  }

  /** 2ª etapa: paga a etiqueta com o saldo da carteira do Melhor Envio. */
  async checkout(shipmentId: string) {
    await this.request('/shipment/checkout', { orders: [shipmentId] });
  }

  /** 3ª etapa: gera a etiqueta (código de rastreio). */
  async generate(shipmentId: string) {
    await this.request('/shipment/generate', { orders: [shipmentId] });
  }

  // Modo "private": o link só abre logado na conta do Melhor Envio
  // (a etiqueta tem o endereço completo do cliente).
  async printUrl(shipmentId: string): Promise<string> {
    const res = await this.request<{ url: string }>('/shipment/print', { mode: 'private', orders: [shipmentId] });
    return res.url;
  }

  async tracking(shipmentIds: string[]): Promise<Record<string, MeTracking>> {
    if (!shipmentIds.length) return {};
    return this.request<Record<string, MeTracking>>('/shipment/tracking', { orders: shipmentIds });
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,
          // Exigido pelo Melhor Envio: nome da aplicação + e-mail de contato.
          'User-Agent': process.env.MELHOR_ENVIO_USER_AGENT ?? 'NaicoTech Store',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      this.logger.error(`Melhor Envio inacessível em ${path}: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Serviço de frete indisponível. Tente de novo em instantes.');
    }

    const data = (await response.json().catch(() => null)) as
      | (T & { message?: string; errors?: Record<string, string[]> })
      | null;
    if (!response.ok || data === null) {
      // Loga só as mensagens de erro, nunca o corpo enviado (tem dados pessoais).
      const detail = data?.errors ? Object.values(data.errors).flat().join(' | ') : '';
      this.logger.error(`Melhor Envio respondeu ${response.status} em ${path}: ${data?.message ?? ''} ${detail}`);
      if (response.status === 401) {
        throw new ServiceUnavailableException('Token do Melhor Envio inválido ou expirado (MELHOR_ENVIO_TOKEN).');
      }
      throw new MelhorEnvioError(response.status, data?.message ?? 'Erro no Melhor Envio', detail);
    }
    return data;
  }
}

export class MelhorEnvioError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail: string,
  ) {
    super(message);
  }
}
