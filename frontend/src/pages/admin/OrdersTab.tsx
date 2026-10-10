import { useCallback, useEffect, useState } from 'react'
import { adminApi } from '../../api/endpoints'
import type { AdminOrder, OrderStatus, ShippingAddressFull } from '../../api/types'
import { formatCep, formatDate, formatPrice, statusLabel, trackingUrl } from '../../utils/format'
import { useAdminSession } from './adminSession'

const FILTERS: (OrderStatus | '')[] = ['', 'PAID', 'SHIPPED', 'DELIVERED', 'PENDING', 'CANCELLED']
const NEXT: Partial<Record<OrderStatus, { status: 'SHIPPED' | 'DELIVERED'; label: string }>> = {
  PAID: { status: 'SHIPPED', label: 'Marcar como enviado' },
  SHIPPED: { status: 'DELIVERED', label: 'Marcar como entregue' },
}
// Status da etiqueta no Melhor Envio.
const LABEL_STATUS: Record<string, string> = {
  processing: 'Gerando etiqueta...',
  pending: 'Etiqueta no carrinho (não paga)',
  released: 'Etiqueta pronta',
  posted: 'Postado',
  delivered: 'Entregue',
  canceled: 'Etiqueta cancelada',
  undelivered: 'Não entregue',
}

export function OrdersTab() {
  const { guard } = useAdminSession()
  const [filter, setFilter] = useState<OrderStatus | ''>('PAID')
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // Endereço completo só de quem o admin pediu para ver (fica na auditoria).
  const [addresses, setAddresses] = useState<Record<string, ShippingAddressFull>>({})

  const load = useCallback(async () => {
    try {
      setOrders(await guard(adminApi.orders(filter || undefined)))
    } catch (err) {
      setError((err as Error).message)
    }
  }, [guard, filter])

  useEffect(() => {
    // Busca dados da API (sistema externo); o setState acontece depois do await.
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  const [settings, setSettings] = useState<{ commercial: boolean; insuranceCap: number | null } | null>(null)
  useEffect(() => {
    guard(adminApi.shippingSettings())
      .then(setSettings)
      .catch(() => undefined)
  }, [guard])

  async function run(key: string, action: () => Promise<string | void>) {
    setError(null)
    setMessage(null)
    setBusy(key)
    try {
      const msg = await action()
      if (msg) setMessage(msg)
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const advance = (order: AdminOrder) =>
    run(order.id, async () => {
      const next = NEXT[order.status]
      if (next) await guard(adminApi.updateOrderStatus(order.id, next.status))
    })

  const generateLabel = (order: AdminOrder) => {
    let invoiceKey: string | undefined
    if (settings?.commercial) {
      // Com CNPJ, cada etiqueta vai com a nota fiscal do pedido.
      invoiceKey = window.prompt('Chave de acesso da NF-e deste pedido (44 dígitos):')?.replace(/\D/g, '')
      if (!invoiceKey) return
    } else {
      const total = order.items.reduce((sum, i) => sum + Number(i.unitPrice) * i.quantity, 0)
      const cap = settings?.insuranceCap ?? 1000
      const warning =
        total > cap
          ? `\n\nAtenção: sem CNPJ o seguro cobre só ${formatPrice(cap)} (pedido de ${formatPrice(total)}). Se o pacote extraviar, a diferença é prejuízo da loja.`
          : ''
      if (!window.confirm(`Comprar a etiqueta com o saldo da carteira do Melhor Envio?${warning}`)) return
    }
    void run(order.id, async () => {
      const result = await guard(adminApi.generateLabel(order.id, invoiceKey))
      return `Etiqueta gerada${result.trackingCode ? `: ${result.trackingCode}` : ''}.`
    })
  }

  const printLabel = (order: AdminOrder) =>
    run(order.id, async () => {
      const { url } = await guard(adminApi.printLabel(order.id))
      // O backend já valida, mas o link vem de terceiro: só abre se for https.
      if (new URL(url, window.location.href).protocol !== 'https:') throw new Error('Link de impressão inválido.')
      window.open(url, '_blank', 'noopener,noreferrer')
    })

  const showAddress = (order: AdminOrder) =>
    run(order.id, async () => {
      const address = await guard(adminApi.orderAddress(order.id))
      setAddresses((current) => ({ ...current, [order.id]: address }))
    })

  const sync = () =>
    run('sync', async () => {
      const r = await guard(adminApi.syncShipments())
      return `${r.checked} envio(s) consultado(s): ${r.shipped} postado(s), ${r.delivered} entregue(s).`
    })

  return (
    <div>
      <div className="admin-toolbar">
        <label>
          Status{' '}
          <select value={filter} onChange={(e) => setFilter(e.target.value as OrderStatus | '')}>
            {FILTERS.map((f) => (
              <option key={f} value={f}>
                {f ? statusLabel[f] : 'Todos'}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="button button-ghost" onClick={sync} disabled={busy === 'sync'}>
          {busy === 'sync' ? 'Consultando...' : 'Atualizar rastreios'}
        </button>
      </div>
      {settings && !settings.commercial && (
        <p className="alert alert-info small">
          Envio sem CNPJ (declaração de conteúdo): o seguro de cada pacote é limitado a{' '}
          {formatPrice(settings.insuranceCap ?? 1000)}. Com CNPJ e nota fiscal, ative SHIPPING_COMMERCIAL=true.
        </p>
      )}
      {message && <p className="alert alert-success">{message}</p>}
      {error && <p className="alert alert-error">{error}</p>}
      <ul className="admin-orders">
        {orders.map((o) => {
          const next = NEXT[o.status]
          const address = addresses[o.id]
          const hasLabel = Boolean(o.shipmentStatus && !['processing', 'pending'].includes(o.shipmentStatus))
          return (
            <li key={o.id} className="card admin-order">
              <div className="admin-order-head">
                <span className="mono">#{o.id.slice(0, 8)}</span>
                <span className={`status status-${o.status.toLowerCase()}`}>{statusLabel[o.status]}</span>
                <span className="muted">{formatDate(o.createdAt)}</span>
                <strong>{formatPrice(o.totalAmount)}</strong>
              </div>
              <div className="muted small">
                {o.user.name} · {o.user.email}
              </div>
              <ul className="admin-order-items">
                {o.items.map((i) => (
                  <li key={i.id}>
                    {i.quantity}× {i.product.name} — {formatPrice(i.unitPrice)}
                  </li>
                ))}
              </ul>

              {o.shippingServiceName && (
                <div className="admin-shipping small">
                  <div>
                    Frete: {o.shippingCompany} {o.shippingServiceName} — {formatPrice(o.shippingPrice)} · {o.shippingSummary}
                  </div>
                  {o.shipmentStatus && <div>Etiqueta: {LABEL_STATUS[o.shipmentStatus] ?? o.shipmentStatus}</div>}
                  {o.trackingCode && (
                    <div>
                      Rastreio:{' '}
                      <a href={trackingUrl(o.trackingCode)} target="_blank" rel="noopener noreferrer" className="mono">
                        {o.trackingCode}
                      </a>
                    </div>
                  )}
                  {address && (
                    <address className="admin-address">
                      {address.recipientName} · CPF {address.document} · Tel. {address.phone}
                      <br />
                      {address.street}, {address.number}
                      {address.complement && ` — ${address.complement}`} · {address.district}
                      <br />
                      {address.city}/{address.state} · CEP {formatCep(address.postalCode)}
                    </address>
                  )}
                </div>
              )}

              <div className="row-actions">
                {o.status === 'PAID' && o.shippingServiceId && !hasLabel && (
                  <button type="button" className="button" disabled={busy === o.id} onClick={() => generateLabel(o)}>
                    {busy === o.id ? 'Gerando...' : 'Gerar etiqueta'}
                  </button>
                )}
                {hasLabel && ['PAID', 'SHIPPED'].includes(o.status) && (
                  <button type="button" className="button button-ghost" disabled={busy === o.id} onClick={() => printLabel(o)}>
                    Imprimir etiqueta
                  </button>
                )}
                {o.shippingServiceName && !address && o.status !== 'PENDING' && (
                  <button type="button" className="link-button" disabled={busy === o.id} onClick={() => showAddress(o)}>
                    Ver endereço completo
                  </button>
                )}
                {next && (
                  <button type="button" className="link-button" disabled={busy === o.id} onClick={() => advance(o)}>
                    {next.label}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {!orders.length && <p className="muted">Nenhum pedido com esse status.</p>}
    </div>
  )
}
