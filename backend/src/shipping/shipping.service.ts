import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MelhorEnvioClient } from './melhor-envio.client';
import type { MeVolume, PackageItem } from './melhor-envio.client';

export interface CartLine {
  productId: string;
  quantity: number;
}

export interface ShippingOption {
  serviceId: number;
  name: string;
  company: string;
  companyId: number;
  picture: string | null;
  price: string;
  deliveryDays: number | null;
}

// Une itens repetidos do mesmo produto.
export function mergeLines(lines: CartLine[]): Map<string, number> {
  const quantities = new Map<string, number>();
  for (const line of lines) {
    quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity);
  }
  return quantities;
}

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly melhorEnvio: MelhorEnvioClient,
  ) {}

  /**
   * Cota o frete com peso, medidas e preço vindos do banco (nunca do navegador).
   * Também devolve os volumes montados pelo Melhor Envio, usados depois na etiqueta.
   */
  async quoteWithVolumes(postalCode: string, lines: CartLine[]) {
    const quantities = mergeLines(lines);
    const products = await this.prisma.product.findMany({
      where: { id: { in: [...quantities.keys()] } },
      select: { id: true, name: true, price: true, weightGrams: true, lengthCm: true, widthCm: true, heightCm: true },
    });
    if (products.length !== quantities.size) {
      throw new NotFoundException('Um dos produtos do carrinho não existe mais');
    }

    const items: (PackageItem & { name: string })[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      quantity: quantities.get(p.id) ?? 1,
      unitPrice: Number(p.price),
      weightGrams: p.weightGrams,
      lengthCm: p.lengthCm,
      widthCm: p.widthCm,
      heightCm: p.heightCm,
    }));

    const quotes = await this.melhorEnvio.calculate(postalCode, items);
    const options = (Array.isArray(quotes) ? quotes : [])
      // Serviços que não atendem o CEP ou o pacote voltam com "error" em vez de preço.
      .filter((q) => !q.error && (q.custom_price ?? q.price))
      .map((q) => ({
        option: {
          serviceId: q.id,
          name: q.name,
          company: q.company.name,
          companyId: q.company.id,
          picture: q.company.picture ?? null,
          // custom_price já inclui taxas/descontos configurados no painel do Melhor Envio.
          price: Number(q.custom_price ?? q.price).toFixed(2),
          deliveryDays: q.custom_delivery_time ?? q.delivery_time ?? null,
        } satisfies ShippingOption,
        volumes: q.packages ?? [],
      }))
      .sort((a, b) => Number(a.option.price) - Number(b.option.price));

    return { options, items };
  }

  async quote(postalCode: string, lines: CartLine[]): Promise<ShippingOption[]> {
    const { options } = await this.quoteWithVolumes(postalCode, lines);
    return options.map((o) => o.option);
  }

  /** Cota de novo e devolve a opção escolhida (com o preço do servidor). */
  async pick(postalCode: string, lines: CartLine[], serviceId: number) {
    const { options, items } = await this.quoteWithVolumes(postalCode, lines);
    const chosen = options.find((o) => o.option.serviceId === serviceId);
    if (!chosen) {
      throw new BadRequestException('Essa opção de frete não está mais disponível. Calcule o frete de novo.');
    }
    return { option: chosen.option, volumes: chosen.volumes as MeVolume[], items };
  }

  // Busca o endereço de um CEP no ViaCEP (pelo backend: o navegador não fala com terceiros).
  async lookupCep(cep: string) {
    let data: { erro?: unknown; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (response.status === 400) throw new NotFoundException('CEP não encontrado');
      data = (await response.json()) as typeof data;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.warn(`ViaCEP indisponível: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Não foi possível consultar o CEP agora. Preencha o endereço manualmente.');
    }
    if (data.erro) throw new NotFoundException('CEP não encontrado');
    return {
      postalCode: cep,
      street: data.logradouro ?? '',
      district: data.bairro ?? '',
      city: data.localidade ?? '',
      state: data.uf ?? '',
    };
  }
}
