const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatPrice(value: string | number): string {
  return brl.format(Number(value))
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export const conditionLabel = { NEW: 'Novo', USED: 'Usado' } as const

export const statusLabel = {
  PENDING: 'Aguardando pagamento',
  PAID: 'Pago',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
} as const

export const onlyDigits = (value: string) => value.replace(/\D/g, '')

export function formatCep(value: string): string {
  const d = onlyDigits(value).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

export function formatCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}

export function formatPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  const split = d.length === 11 ? 7 : 6
  return `(${d.slice(0, 2)}) ${d.slice(2, split)}-${d.slice(split)}`
}

export function deliveryLabel(days: number | null): string {
  if (!days) return 'Prazo informado na postagem'
  return `Até ${days} ${days === 1 ? 'dia útil' : 'dias úteis'}`
}

// Página de rastreio que funciona para qualquer transportadora (Correios, Jadlog...).
export const trackingUrl = (code: string) =>
  `https://www.melhorrastreio.com.br/rastreio/${encodeURIComponent(code)}`
