import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Lock, MapPin, Trash2 } from 'lucide-react'
import { addressesApi, ordersApi, shippingApi } from '../api/endpoints'
import type { AddressInput, SavedAddress, ShippingOption } from '../api/types'
import { AddressForm } from '../components/AddressForm'
import { ProductImage } from '../components/ProductImage'
import { ShippingOptions } from '../components/ShippingOptions'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { EMPTY_ADDRESS } from '../utils/address'
import { formatPrice, onlyDigits } from '../utils/format'

const NEW_ADDRESS = 'new'

export function CartPage() {
  const { items, total, setQuantity, remove, clear } = useCart()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // ---------- Entrega ----------
  const [saved, setSaved] = useState<SavedAddress[]>([])
  const [target, setTarget] = useState<string>(NEW_ADDRESS)
  const [address, setAddress] = useState<AddressInput>(EMPTY_ADDRESS)
  const [saveAddress, setSaveAddress] = useState(false)
  const [options, setOptions] = useState<ShippingOption[] | null>(null)
  const [selected, setSelected] = useState<ShippingOption | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [quoting, setQuoting] = useState(false)

  const lines = useMemo(() => items.map((i) => ({ productId: i.productId, quantity: i.quantity })), [items])
  const cep = onlyDigits(address.postalCode)

  useEffect(() => {
    if (!user) return
    let active = true
    addressesApi
      .list()
      .then((list) => {
        if (!active) return
        setSaved(list)
        if (list.length) setTarget(list[0].id)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [user])

  // Recota sempre que muda o endereço ou o carrinho.
  const quote = useCallback(async () => {
    const usingSaved = target !== NEW_ADDRESS
    if (!lines.length || (!usingSaved && cep.length !== 8)) {
      setOptions(null)
      setSelected(null)
      return
    }
    setQuoting(true)
    setQuoteError(null)
    try {
      const result = usingSaved ? await shippingApi.quoteForAddress(target, lines) : await shippingApi.quote(cep, lines)
      setOptions(result)
      // Mantém a escolha se ela ainda existe (com o preço novo); senão, a mais barata.
      setSelected((current) => result.find((o) => o.serviceId === current?.serviceId) ?? result[0] ?? null)
    } catch (err) {
      setOptions(null)
      setSelected(null)
      setQuoteError((err as Error).message)
    } finally {
      setQuoting(false)
    }
  }, [target, cep, lines])

  useEffect(() => {
    if (!user) return
    // Busca dados da API (sistema externo); o setState acontece depois do await.
    // oxlint-disable-next-line react/set-state-in-effect
    void quote()
  }, [user, quote])

  async function removeSaved(id: string) {
    if (!window.confirm('Apagar este endereço salvo?')) return
    try {
      await addressesApi.remove(id)
      const rest = saved.filter((a) => a.id !== id)
      setSaved(rest)
      if (target === id) setTarget(rest[0]?.id ?? NEW_ADDRESS)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function checkout(e?: FormEvent) {
    e?.preventDefault()
    if (!user) {
      navigate('/login', { state: { from: '/carrinho' } })
      return
    }
    if (!selected) {
      setError('Escolha uma opção de frete.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const order = await ordersApi.create({
        items: lines,
        shippingServiceId: selected.serviceId,
        ...(target === NEW_ADDRESS ? { address, saveAddress } : { addressId: target }),
      })
      clear()
      navigate(`/pedidos/${order.id}`)
    } catch (err) {
      // Ex.: estoque insuficiente, frete indisponível ou endereço inválido.
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (items.length === 0) {
    return (
      <section>
        <h1>Carrinho</h1>
        <p className="muted">Seu carrinho está vazio.</p>
        <Link to="/" className="button">
          Ver produtos
        </Link>
      </section>
    )
  }

  const shippingPrice = selected ? Number(selected.price) : 0

  return (
    <section>
      <h1>Carrinho</h1>
      <ul className="cart-list">
        {items.map((item) => (
          <li key={item.productId} className="card cart-item">
            <ProductImage src={item.image} alt={item.name} />
            <div className="cart-item-info">
              <Link to={`/produtos/${item.productId}`}>{item.name}</Link>
              <span className="muted">{formatPrice(item.price)} cada</span>
            </div>
            <input
              type="number"
              min={1}
              max={item.stock}
              value={item.quantity}
              onChange={(e) => setQuantity(item.productId, Number(e.target.value) || 1)}
              aria-label={`Quantidade de ${item.name}`}
            />
            <strong className="cart-item-total">
              {formatPrice(Number(item.price) * item.quantity)}
            </strong>
            <button
              type="button"
              className="link-button danger"
              onClick={() => remove(item.productId)}
            >
              Remover
            </button>
          </li>
        ))}
      </ul>

      <form className="checkout" onSubmit={checkout}>
        {user && (
          <div className="card checkout-delivery">
            <h2>
              <MapPin size={20} aria-hidden="true" /> Entrega
            </h2>

            {saved.length > 0 && (
              <ul className="saved-addresses" role="radiogroup" aria-label="Endereço de entrega">
                {saved.map((a) => (
                  <li key={a.id} className={`saved-address ${target === a.id ? 'active' : ''}`}>
                    <label>
                      <input type="radio" name="address" checked={target === a.id} onChange={() => setTarget(a.id)} />
                      <span>
                        <strong>{a.recipient}</strong> · {a.line}
                        <span className="muted small">
                          {' '}
                          {a.city} · CEP {a.postalCode}
                        </span>
                      </span>
                    </label>
                    <button type="button" className="link-button danger" onClick={() => removeSaved(a.id)} aria-label="Apagar endereço">
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </li>
                ))}
                <li className={`saved-address ${target === NEW_ADDRESS ? 'active' : ''}`}>
                  <label>
                    <input type="radio" name="address" checked={target === NEW_ADDRESS} onChange={() => setTarget(NEW_ADDRESS)} />
                    <span>Entregar em outro endereço</span>
                  </label>
                </li>
              </ul>
            )}

            {target === NEW_ADDRESS && (
              <>
                <AddressForm value={address} onChange={setAddress} />
                <label className="checkbox save-address">
                  <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
                  <span>
                    Salvar este endereço para as próximas compras
                    <small className="muted">
                      {' '}
                      <Lock size={12} aria-hidden="true" /> Guardado criptografado. Você pode apagar quando quiser.
                    </small>
                  </span>
                </label>
              </>
            )}

            <h3 className="checkout-subtitle">Frete</h3>
            {quoting && <p className="muted small">Calculando frete...</p>}
            {quoteError && <p className="alert alert-error">{quoteError}</p>}
            {!quoting && !options && !quoteError && <p className="muted small">Informe o CEP para ver as opções de frete.</p>}
            {options && (
              <ShippingOptions options={options} selected={selected?.serviceId ?? null} onSelect={setSelected} />
            )}
          </div>
        )}

        <div className="cart-summary card">
          <div className="cart-summary-row">
            <span>Produtos</span>
            <span>{formatPrice(total)}</span>
          </div>
          {user && (
            <div className="cart-summary-row">
              <span>Frete</span>
              <span>{selected ? formatPrice(selected.price) : '—'}</span>
            </div>
          )}
          <div className="cart-summary-row">
            <span>Total</span>
            <strong className="price price-lg">{formatPrice(total + shippingPrice)}</strong>
          </div>
          <p className="muted small">Preços e frete são confirmados pelo servidor ao criar o pedido.</p>
          {error && <p className="alert alert-error">{error}</p>}
          <button type="submit" className="button" disabled={submitting || (Boolean(user) && (!selected || quoting))}>
            {submitting ? 'Criando pedido...' : user ? 'Finalizar pedido' : 'Entrar para finalizar'}
          </button>
        </div>
      </form>
    </section>
  )
}
