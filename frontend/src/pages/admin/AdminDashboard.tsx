import { useCallback, useMemo, useState } from 'react'
import { AdminSessionContext, isStepUpError } from './adminSession'
import { CategoriesTab } from './CategoriesTab'
import { OrdersTab } from './OrdersTab'
import { ProductsTab } from './ProductsTab'
import { SecurityTab } from './SecurityTab'

const TABS = [
  { id: 'products', label: 'Produtos' },
  { id: 'orders', label: 'Pedidos' },
  { id: 'categories', label: 'Categorias' },
  { id: 'security', label: 'Segurança' },
] as const
type Tab = (typeof TABS)[number]['id']

interface Props {
  notice: string | null
  onStepUpRequired: () => void
  onAuthenticatorReset: () => void
  onEndSession: () => void
}

export function AdminDashboard({ notice, onStepUpRequired, onAuthenticatorReset, onEndSession }: Props) {
  const [tab, setTab] = useState<Tab>('products')

  const guard = useCallback(
    <T,>(promise: Promise<T>) =>
      promise.catch((err: unknown) => {
        if (isStepUpError(err)) onStepUpRequired()
        throw err
      }),
    [onStepUpRequired],
  )
  const session = useMemo(() => ({ guard }), [guard])

  return (
    <AdminSessionContext.Provider value={session}>
      <section>
        <div className="admin-header">
          <h1>Painel de admin</h1>
          <button type="button" className="link-button" onClick={onEndSession}>
            Sair do painel
          </button>
        </div>
        {notice && <p className="alert alert-info">{notice}</p>}

        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'products' && <ProductsTab />}
        {tab === 'orders' && <OrdersTab />}
        {tab === 'categories' && <CategoriesTab />}
        {tab === 'security' && <SecurityTab onAuthenticatorReset={onAuthenticatorReset} />}
      </section>
    </AdminSessionContext.Provider>
  )
}
