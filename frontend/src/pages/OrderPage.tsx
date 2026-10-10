import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { catalogApi, ordersApi } from '../api/endpoints'
import type { Order } from '../api/types'
import { CardPaymentForm } from '../components/CardPaymentForm'
import { useAuth } from '../context/AuthContext'
import { DeliveryCard } from '../components/DeliveryCard'
import { formatDate, formatPrice, statusLabel } from '../utils/format'
import { useAsync } from '../utils/useAsync'

// Mesmo prazo do backend (ORDER_PAYMENT_WINDOW_MS em orders.service.ts).
const ORDER_PAYMENT_WINDOW_MS = 30 * 60 * 1000

type PaymentFeedback = { kind: 'success' | 'info' | 'error'; message: string }

export function OrderPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const order = useAsync(() => ordersApi.one(id), [id])
  // Pedido atualizado pela resposta do pagamento, sem precisar recarregar a página.
  const [updated, setUpdated] = useState<Order | null>(null)
  const [feedback, setFeedback] = useState<PaymentFeedback | null>(null)
  // Relógio da tela, para o prazo de pagamento expirar sem recarregar a página.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [])

  const handlePaid = useCallback((result: Order) => {
    setUpdated(result)
    setFeedback(
      result.status === 'PAID'
        ? { kind: 'success', message: 'Pagamento aprovado! Obrigado pela compra.' }
        : {
            kind: 'info',
            message:
              'Pagamento em análise pelo Mercado Pago. O status muda sozinho quando for confirmado.',
          },
    )
  }, [])
  const handlePaymentError = useCallback((message: string) => {
    setFeedback({ kind: 'error', message })
  }, [])
  // O pedido só traz productId; buscamos o catálogo para mostrar os nomes.
  const products = useAsync(catalogApi.products, [])
  const names = useMemo(
    () => new Map(products.data?.map((p) => [p.id, p.name])),
    [products.data],
  )

  if (order.loading) return <p className="muted">Carregando...</p>
  if (order.error || !order.data) {
    return <p className="alert alert-error">{order.error ?? 'Pedido não encontrado'}</p>
  }

  // A resposta do pagamento atualiza status/paymentId; os itens vêm da carga original
  // se por algum motivo não vierem na resposta.
  const o: Order = updated
    ? { ...order.data, ...updated, items: updated.items ?? order.data.items }
    : order.data
  const items = o.items ?? []
  const expiresAt = new Date(new Date(o.createdAt).getTime() + ORDER_PAYMENT_WINDOW_MS)
  const expired = expiresAt.getTime() <= now
  // Com paymentId e ainda PENDING, já há um pagamento em análise; não oferece outro.
  const canPay = o.status === 'PENDING' && !o.paymentId && !expired
  return (
    <section>
      <Link to="/pedidos" className="back-link">
        ← Meus pedidos
      </Link>
      <h1>
        Pedido <span className="mono">#{o.id.slice(0, 8)}</span>
      </h1>
      <p>
        <span className={`status status-${o.status.toLowerCase()}`}>{statusLabel[o.status]}</span>{' '}
        <span className="muted">· {formatDate(o.createdAt)}</span>
      </p>

      <table className="table card">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Qtd.</th>
            <th>Preço unit.</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <Link to={`/produtos/${item.productId}`}>
                  {names.get(item.productId) ?? 'Produto'}
                </Link>
              </td>
              <td>{item.quantity}</td>
              <td>{formatPrice(item.unitPrice)}</td>
              <td>{formatPrice(Number(item.unitPrice) * item.quantity)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {o.shippingServiceName && (
            <tr>
              <td colSpan={3}>
                Frete <span className="muted small">({o.shippingCompany} {o.shippingServiceName})</span>
              </td>
              <td>{formatPrice(o.shippingPrice)}</td>
            </tr>
          )}
          <tr>
            <td colSpan={3}>Total</td>
            <td>
              <strong>{formatPrice(o.totalAmount)}</strong>
            </td>
          </tr>
        </tfoot>
      </table>

      {o.shippingServiceName && o.status !== 'CANCELLED' && <DeliveryCard order={o} />}

      {feedback && <p className={`alert alert-${feedback.kind}`}>{feedback.message}</p>}

      {o.status === 'PENDING' && !o.paymentId && !feedback && (
        <p className={`alert ${expired ? 'alert-error' : 'alert-info'}`}>
          {expired
            ? 'O prazo de pagamento deste pedido acabou. Ele será cancelado e os itens voltam ao estoque.'
            : `Pague até ${expiresAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} para garantir os itens. Depois disso o pedido é cancelado.`}
        </p>
      )}

      {o.status === 'PENDING' && o.paymentId && !feedback && (
        <p className="alert alert-info">
          Pagamento em análise pelo Mercado Pago. O status muda sozinho quando for confirmado.
        </p>
      )}

      {canPay && user && (
        <div className="payment card">
          <h2>Pagamento</h2>
          <CardPaymentForm
            order={o}
            email={user.email}
            onPaid={handlePaid}
            onError={handlePaymentError}
          />
        </div>
      )}
    </section>
  )
}
