// Catálogo de demonstração: categorias e produtos de exemplo para a loja não abrir vazia.
// Uso: npm run seed (no diretório backend). Pode rodar várias vezes: atualiza em vez de duplicar.
// Imagens: Wikimedia Commons (licenças livres; créditos no README).
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import pg from 'pg';

if (existsSync('.env')) process.loadEnvFile('.env');
if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  console.error('Recusado: NODE_ENV=production. O seed é só para desenvolvimento/demonstração (use --force se tiver certeza).');
  process.exit(1);
}

const commons = (path) => `https://thumb.wikimedia.org/wikipedia/commons/thumb/${path}`;

const CATEGORIES = [
  { name: 'Placas de Vídeo', slug: 'placas-de-video' },
  { name: 'Processadores', slug: 'processadores' },
  { name: 'Memória RAM', slug: 'memoria-ram' },
  { name: 'SSD e Armazenamento', slug: 'ssd-armazenamento' },
  { name: 'Monitores', slug: 'monitores' },
  { name: 'Teclados', slug: 'teclados' },
  { name: 'Mouses', slug: 'mouses' },
  { name: 'Headsets', slug: 'headsets' },
];

// Peso e medidas = pacote pronto para envio (usados no cálculo do frete).
const PRODUCTS = [
  {
    category: 'placas-de-video',
    name: 'Placa de Vídeo PNY GeForce RTX 5060 Ti 16GB GDDR7 OC Dual Fan',
    price: '3799.90', costPrice: '3250.00', stock: 2, condition: 'NEW',
    pkg: [1500, 32, 22, 12],
    images: [
      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Nvidia_GeForce_RTX_5060_Ti_16GB%2C_PNY_Overclocked_Dual_Fan%2C_front.jpg/1280px-Nvidia_GeForce_RTX_5060_Ti_16GB%2C_PNY_Overclocked_Dual_Fan%2C_front.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Nvidia_GeForce_RTX_5060_Ti_16GB%2C_PNY_Overclocked_Dual_Fan%2C_rear.jpg/1280px-Nvidia_GeForce_RTX_5060_Ti_16GB%2C_PNY_Overclocked_Dual_Fan%2C_rear.jpg',
    ],
    description: `Placa de vídeo NVIDIA GeForce RTX 5060 Ti da PNY com 16 GB de memória GDDR7, ideal para jogos em 1080p e 1440p com Ray Tracing e DLSS 4 (Multi Frame Generation).

Especificações:
- GPU: NVIDIA GeForce RTX 5060 Ti (arquitetura Blackwell)
- Memória: 16 GB GDDR7, interface de 128 bits
- Clock boost: até 2,6 GHz (versão OC)
- Interface: PCI Express 5.0 x8
- Saídas: 1x HDMI 2.1b, 3x DisplayPort 2.1b
- Consumo (TGP): 180 W, 1 conector de 8 pinos
- Fonte recomendada: 600 W
- Refrigeração: dual fan

Produto novo, lacrado, com garantia de 3 anos do fabricante.`,
  },
  {
    category: 'placas-de-video',
    name: 'Placa de Vídeo ASUS ROG Strix GeForce RTX 4090 24GB GDDR6X',
    price: '10999.90', costPrice: '9400.00', stock: 1, condition: 'USED',
    pkg: [3200, 45, 30, 15],
    images: [commons('6/64/Asus_Strix_RTX_4090_operational.jpg/960px-Asus_Strix_RTX_4090_operational.jpg')],
    description: `RTX 4090 seminova da linha ROG Strix, para jogos em 4K com Ray Tracing, criação de conteúdo e IA local.

Especificações:
- GPU: NVIDIA GeForce RTX 4090 (arquitetura Ada Lovelace)
- Memória: 24 GB GDDR6X, interface de 384 bits
- Interface: PCI Express 4.0 x16
- Saídas: 2x HDMI 2.1, 3x DisplayPort 1.4a
- Consumo: 450 W, conector 12VHPWR
- Fonte recomendada: 1000 W

Usada, testada e revisada, sem marcas de uso relevantes. Acompanha caixa original.`,
  },
  {
    category: 'processadores',
    name: 'Processador AMD Ryzen 7 1800X 8 Núcleos 3.6GHz AM4',
    price: '549.90', costPrice: '420.00', stock: 3, condition: 'USED',
    pkg: [300, 15, 12, 6],
    images: [commons('3/3f/AMD_Ryzen_7_1800X.jpg/960px-AMD_Ryzen_7_1800X.jpg')],
    description: `Processador de 8 núcleos e 16 threads, ótimo custo-benefício para montar um PC gamer ou de trabalho em plataforma AM4.

Especificações:
- Núcleos/threads: 8/16
- Clock: 3,6 GHz (boost de até 4,0 GHz)
- Cache L3: 16 MB
- Soquete: AM4
- TDP: 95 W
- Cooler: não incluso

Usado, testado e funcionando perfeitamente.`,
  },
  {
    category: 'memoria-ram',
    name: 'Memória RAM 16GB DDR4 3200MHz CL16 Desktop',
    price: '269.90', costPrice: '190.00', stock: 10, condition: 'NEW',
    pkg: [200, 18, 8, 3],
    images: [commons('6/6c/RAM_Module_%28SDRAM-DDR4%29.jpg/960px-RAM_Module_%28SDRAM-DDR4%29.jpg')],
    description: `Módulo de 16 GB DDR4 para desktop, o tamanho ideal para jogos atuais e multitarefa.

Especificações:
- Capacidade: 16 GB (1x 16 GB)
- Tipo: DDR4 UDIMM, 288 pinos
- Frequência: 3200 MHz
- Latência: CL16
- Tensão: 1,35 V

Produto novo com garantia de 1 ano.`,
  },
  {
    category: 'ssd-armazenamento',
    name: 'SSD Samsung 980 PRO 1TB NVMe M.2 PCIe 4.0',
    price: '649.90', costPrice: '520.00', stock: 6, condition: 'NEW',
    pkg: [150, 16, 11, 3],
    images: [commons('7/75/Samsung_980_PRO_PCIe_4.0_NVMe_SSD_1TB-top_PNr%C2%B00915.jpg/960px-Samsung_980_PRO_PCIe_4.0_NVMe_SSD_1TB-top_PNr%C2%B00915.jpg')],
    description: `SSD NVMe de alto desempenho para carregar jogos e sistema em segundos. Compatível com PlayStation 5 (com dissipador).

Especificações:
- Capacidade: 1 TB
- Formato: M.2 2280
- Interface: PCIe 4.0 x4, NVMe
- Leitura sequencial: até 7.000 MB/s
- Gravação sequencial: até 5.000 MB/s

Produto novo com garantia de 5 anos do fabricante.`,
  },
  {
    category: 'ssd-armazenamento',
    name: 'SSD NVMe M.2 2230 256GB PCIe 3.0',
    price: '189.90', costPrice: '130.00', stock: 8, condition: 'NEW',
    pkg: [100, 12, 9, 2],
    images: [commons('0/03/A_2230_NVME_SSD.jpg/960px-A_2230_NVME_SSD.jpg')],
    description: `SSD compacto no formato 2230, para notebooks ultrafinos, Steam Deck e mini PCs.

Especificações:
- Capacidade: 256 GB
- Formato: M.2 2230
- Interface: PCIe 3.0 x4, NVMe
- Leitura sequencial: até 2.000 MB/s

Produto novo com garantia de 1 ano.`,
  },
  {
    category: 'monitores',
    name: 'Monitor EIZO Foris FG2421 24" Full HD 120Hz',
    price: '899.90', costPrice: '650.00', stock: 1, condition: 'USED',
    pkg: [7500, 66, 44, 18],
    images: [commons('3/34/EIZO_Foris_FG2421_VGA_computer_monitor_displaying_test_pattern.png/960px-EIZO_Foris_FG2421_VGA_computer_monitor_displaying_test_pattern.png')],
    description: `Monitor gamer de 24 polegadas com painel VA de alto contraste e 120 Hz, focado em movimento nítido.

Especificações:
- Tela: 23,5" VA, 1920 x 1080
- Taxa de atualização: 120 Hz
- Contraste: 5000:1
- Entradas: DVI-D, DisplayPort, HDMI

Usado, sem pixels mortos, com base original.`,
  },
  {
    category: 'teclados',
    name: 'Teclado Mecânico Logitech G910 Orion Spectrum RGB',
    price: '799.90', costPrice: '600.00', stock: 4, condition: 'NEW',
    pkg: [1800, 52, 25, 7],
    images: ['https://upload.wikimedia.org/wikipedia/commons/f/fe/Logitech-g910_%2816475940137%29.jpg'],
    description: `Teclado mecânico com switches Romer-G, iluminação RGB por tecla e 9 teclas G programáveis.

Especificações:
- Switches: mecânicos Romer-G
- Iluminação: RGB LIGHTSYNC por tecla
- Teclas programáveis: 9 teclas G
- Conexão: USB
- Apoio de pulso removível

Produto novo com garantia de 2 anos.`,
  },
  {
    category: 'mouses',
    name: 'Mouse Gamer Logitech G903 LIGHTSPEED Sem Fio',
    price: '599.90', costPrice: '450.00', stock: 5, condition: 'NEW',
    pkg: [400, 20, 14, 8],
    images: [commons('7/71/2023_Mysz_komputerowa_Logitech_G903_Lightspeed.jpg/960px-2023_Mysz_komputerowa_Logitech_G903_Lightspeed.jpg')],
    description: `Mouse sem fio de nível profissional, com latência de 1 ms e design ambidestro.

Especificações:
- Sensor: HERO 25K, até 25.600 DPI
- Conexão: LIGHTSPEED sem fio (1 ms)
- Bateria: até 180 horas
- Botões: 11 programáveis
- Compatível com carregamento POWERPLAY

Produto novo com garantia de 2 anos.`,
  },
  {
    category: 'headsets',
    name: 'Headset Gamer RGB Som Surround 7.1 USB',
    price: '249.90', costPrice: '160.00', stock: 12, condition: 'NEW',
    pkg: [700, 24, 22, 12],
    images: [commons('7/7a/RGB_gaming_headset_on_desk_with_ambient_lighting.jpg/960px-RGB_gaming_headset_on_desk_with_ambient_lighting.jpg')],
    description: `Headset confortável para longas partidas, com som surround virtual e microfone com cancelamento de ruído.

Especificações:
- Som: surround virtual 7.1
- Drivers: 50 mm
- Microfone: removível, com cancelamento de ruído
- Conexão: USB
- Iluminação: RGB

Produto novo com garantia de 1 ano.`,
  },
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  const categoryIds = {};
  for (const c of CATEGORIES) {
    const { rows } = await client.query(
      `INSERT INTO "Category" (id, name, slug) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [randomUUID(), c.name, c.slug],
    );
    categoryIds[c.slug] = rows[0].id;
  }

  let created = 0;
  let updated = 0;
  for (const p of PRODUCTS) {
    const [weightGrams, lengthCm, widthCm, heightCm] = p.pkg;
    const values = [p.name, p.description, p.price, p.costPrice, p.stock, p.condition, p.images, categoryIds[p.category], weightGrams, lengthCm, widthCm, heightCm];
    const existing = await client.query('SELECT id FROM "Product" WHERE name = $1', [p.name]);
    if (existing.rowCount) {
      // O estoque de produtos que já existem não é mexido (pode ter vendas).
      const [name, description, price, costPrice, , condition, ...rest] = values;
      await client.query(
        `UPDATE "Product" SET description = $2, price = $3, "costPrice" = $4, condition = $5, images = $6,
           "categoryId" = $7, "weightGrams" = $8, "lengthCm" = $9, "widthCm" = $10, "heightCm" = $11, "updatedAt" = now()
         WHERE name = $1`,
        [name, description, price, costPrice, condition, ...rest],
      );
      updated++;
    } else {
      await client.query(
        `INSERT INTO "Product" (id, name, description, price, "costPrice", stock, condition, images, "categoryId",
           "weightGrams", "lengthCm", "widthCm", "heightCm", "updatedAt")
         VALUES ($13, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())`,
        [...values, randomUUID()],
      );
      created++;
    }
  }
  await client.query('COMMIT');
  console.log(`Seed concluído: ${CATEGORIES.length} categorias, ${created} produto(s) criado(s), ${updated} atualizado(s).`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
