import { Link } from 'react-router-dom'
import { ordersApi } from '../api/endpoints'
import { formatDate, formatPrice, statusLabel } from '../utils/format'
import { useAsync } from '../utils/useAsync'

export function OrdersPage() {
  const orders = useAsync(ordersApi.mine, [])

  return (
    <section>
      <h1>Meus pedidos</h1>
      {orders.loading && <p className="muted">Carregando...</p>}
      {orders.error && <p className="alert alert-error">{orders.error}</p>}
      {orders.data?.length === 0 && <p className="muted">Você ainda não fez nenhum pedido.</p>}

      <ul className="order-list">
        {orders.data?.map((o) => (
          <li key={o.id}>
            <Link to={`/pedidos/${o.id}`} className="card order-row">
              <span className="mono">#{o.id.slice(0, 8)}</span>
              <span className="muted">{formatDate(o.createdAt)}</span>
              <span className={`status status-${o.status.toLowerCase()}`}>
                {statusLabel[o.status]}
              </span>
              <strong>{formatPrice(o.totalAmount)}</strong>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
