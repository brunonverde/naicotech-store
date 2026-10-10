import { CheckCircle2, CircleDot, Copy, ExternalLink, MapPin, Package, Truck } from 'lucide-react'
import type { Order } from '../api/types'
import { useToast } from '../context/ToastContext'
import { deliveryLabel, formatDate, trackingUrl } from '../utils/format'

// Andamento da entrega e código de rastreio do pedido.
export function DeliveryCard({ order }: { order: Order }) {
  const { notify } = useToast()
  const paid = order.status !== 'PENDING'
  const steps = [
    { label: 'Pagamento aprovado', done: paid, icon: CheckCircle2 },
    { label: 'Etiqueta gerada', done: Boolean(order.trackingCode) || Boolean(order.shippedAt), icon: Package },
    { label: 'A caminho', done: Boolean(order.shippedAt), date: order.shippedAt, icon: Truck },
    { label: 'Entregue', done: Boolean(order.deliveredAt), date: order.deliveredAt, icon: MapPin },
  ]

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      notify('Código copiado', code)
    } catch {
      // Sem permissão de área de transferência: o código continua visível na tela.
    }
  }

  return (
    <div className="card delivery-card">
      <h2>
        <Truck size={20} aria-hidden="true" /> Entrega
      </h2>
      <p className="muted small">
        {order.shippingCompany} {order.shippingServiceName} · {deliveryLabel(order.shippingDeliveryDays)} após a postagem
        {order.shippingSummary && ` · ${order.shippingSummary}`}
      </p>

      <ol className="delivery-steps">
        {steps.map(({ label, done, date, icon: Icon }) => (
          <li key={label} className={done ? 'done' : ''}>
            {done ? <Icon size={18} aria-hidden="true" /> : <CircleDot size={18} aria-hidden="true" />}
            <span>
              {label}
              {date && <span className="muted small"> · {formatDate(date)}</span>}
            </span>
          </li>
        ))}
      </ol>

      {order.trackingCode ? (
        <div className="tracking">
          <span className="muted small">Código de rastreio</span>
          <div className="tracking-row">
            <strong className="mono">{order.trackingCode}</strong>
            <button type="button" className="link-button" onClick={() => copyCode(order.trackingCode!)} aria-label="Copiar código">
              <Copy size={16} aria-hidden="true" />
            </button>
            <a className="button button-ghost" href={trackingUrl(order.trackingCode)} target="_blank" rel="noopener noreferrer">
              Rastrear <ExternalLink size={14} aria-hidden="true" />
            </a>
          </div>
        </div>
      ) : (
        paid && <p className="muted small">O código de rastreio aparece aqui assim que o pedido for despachado.</p>
      )}
    </div>
  )
}
