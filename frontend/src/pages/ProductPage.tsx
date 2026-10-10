import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, CreditCard, Lock, Minus, Plus, ShieldCheck, ShoppingCart, Star, Zap } from 'lucide-react'
import { catalogApi } from '../api/endpoints'
import { ProductImage } from '../components/ProductImage'
import { ShippingCalculator } from '../components/ShippingCalculator'
import { useCart } from '../context/CartContext'
import { useToast } from '../context/ToastContext'
import { categoryIcon } from '../utils/categoryIcon'
import { conditionLabel, formatDate, formatPrice } from '../utils/format'
import { useAsync } from '../utils/useAsync'

// Separa a descrição em parágrafos e especificações ("- Chave: valor").
function parseDescription(text: string) {
  const paragraphs: string[] = []
  const specs: [string, string][] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || /^especifica[cç][oõ]es:?$/i.test(line)) continue
    const spec = line.match(/^[-•]\s*([^:]{2,40}):\s*(.+)$/)
    if (spec) specs.push([spec[1].trim(), spec[2].trim()])
    else paragraphs.push(line.replace(/^[-•]\s*/, ''))
  }
  return { paragraphs, specs }
}

export function ProductPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const product = useAsync(() => catalogApi.product(id), [id])
  const reviews = useAsync(() => catalogApi.reviews(id), [id])
  const { add, items } = useCart()
  const { notify } = useToast()
  const [quantity, setQuantity] = useState(1)
  const [imageIndex, setImageIndex] = useState(0)

  const description = useMemo(
    () => parseDescription(product.data?.description ?? ''),
    [product.data?.description],
  )
  const rating = useMemo(() => {
    const list = reviews.data ?? []
    return list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : null
  }, [reviews.data])

  if (product.loading) {
    return (
      <div className="product-detail">
        <div className="skeleton skeleton-media gallery-main" />
        <div className="product-info">
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-price" />
        </div>
      </div>
    )
  }
  if (product.error || !product.data) {
    return (
      <div className="empty-state card">
        <strong>{product.error ?? 'Produto não encontrado'}</strong>
        <Link to="/">Voltar para a loja</Link>
      </div>
    )
  }

  const p = product.data
  const Icon = categoryIcon(p.category.slug)
  const inCart = items.find((i) => i.productId === p.id)?.quantity ?? 0
  const available = Math.max(0, p.stock - inCart)
  const qty = Math.min(quantity, Math.max(1, available))

  function addToCart(goToCart: boolean) {
    add(p, qty)
    setQuantity(1)
    if (goToCart) navigate('/carrinho')
    else notify('Adicionado ao carrinho', `${qty}× ${p.name}`)
  }

  return (
    <>
      <nav className="breadcrumb" aria-label="Você está em">
        <Link to="/">Início</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <Link to={`/?categoria=${p.category.slug}#catalogo`}>{p.category.name}</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span>{p.name}</span>
      </nav>

      <div className="product-detail">
        <div className="gallery">
          <div className="gallery-main card">
            <ProductImage key={imageIndex} src={p.images[imageIndex]} alt={p.name} FallbackIcon={Icon} className="fade-in" />
          </div>
          {p.images.length > 1 && (
            <div className="thumbs">
              {p.images.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  className={`thumb ${i === imageIndex ? 'active' : ''}`}
                  onClick={() => setImageIndex(i)}
                  aria-label={`Ver imagem ${i + 1}`}
                  aria-current={i === imageIndex}
                >
                  <ProductImage src={src} alt="" FallbackIcon={Icon} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="product-info">
          <div className="tags">
            <span className={`tag tag-${p.condition.toLowerCase()}`}>{conditionLabel[p.condition]}</span>
            <span className="tag">{p.category.name}</span>
          </div>
          <h1 className="product-title">{p.name}</h1>
          {rating !== null && (
            <a href="#avaliacoes" className="rating-summary">
              <span className="stars" aria-label={`${rating.toFixed(1)} de 5`}>
                {'★'.repeat(Math.round(rating))}
                {'☆'.repeat(5 - Math.round(rating))}
              </span>
              <span className="muted small">({reviews.data?.length} avaliações)</span>
            </a>
          )}

          <div className="buy-box card">
            <span className="price price-xl">{formatPrice(p.price)}</span>
            <span className="muted">ou em até 12x no cartão de crédito</span>
            <span className={`stock ${p.stock === 0 ? 'out' : p.stock <= 3 ? 'low' : ''}`}>
              {p.stock === 0 ? 'Esgotado' : p.stock <= 3 ? `Restam só ${p.stock}!` : 'Em estoque'}
              {inCart > 0 && ` · ${inCart} no seu carrinho`}
            </span>

            {available > 0 ? (
              <>
                <div className="qty" role="group" aria-label="Quantidade">
                  <button type="button" onClick={() => setQuantity(Math.max(1, qty - 1))} aria-label="Diminuir" disabled={qty <= 1}>
                    <Minus size={16} />
                  </button>
                  <output aria-live="polite">{qty}</output>
                  <button type="button" onClick={() => setQuantity(Math.min(available, qty + 1))} aria-label="Aumentar" disabled={qty >= available}>
                    <Plus size={16} />
                  </button>
                </div>
                <button type="button" className="button button-lg button-block" onClick={() => addToCart(true)}>
                  <Zap size={18} aria-hidden="true" /> Comprar agora
                </button>
                <button type="button" className="button button-ghost button-block" onClick={() => addToCart(false)}>
                  <ShoppingCart size={18} aria-hidden="true" /> Adicionar ao carrinho
                </button>
              </>
            ) : (
              <p className="muted small">
                {p.stock === 0 ? 'Produto sem estoque no momento.' : 'Você já tem todo o estoque no carrinho.'}
              </p>
            )}

            {p.stock > 0 && <ShippingCalculator productId={p.id} quantity={qty} />}

            <ul className="buy-trust">
              <li>
                <ShieldCheck size={16} aria-hidden="true" /> Pagamento seguro pelo Mercado Pago
              </li>
              <li>
                <Lock size={16} aria-hidden="true" /> Dados do cartão não passam pela loja
              </li>
              <li>
                <CreditCard size={16} aria-hidden="true" /> Crédito ou débito
              </li>
            </ul>
          </div>
        </div>
      </div>

      <section className="section product-sections">
        <div className="card product-section">
          <h2 className="section-title">Descrição</h2>
          {description.paragraphs.map((text, i) => (
            <p key={i} className="description">
              {text}
            </p>
          ))}
        </div>
        {description.specs.length > 0 && (
          <div className="card product-section">
            <h2 className="section-title">Especificações</h2>
            <dl className="specs">
              {description.specs.map(([k, v]) => (
                <div key={k} className="spec-row">
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </section>

      <section id="avaliacoes" className="section">
        <h2 className="section-title">
          <Star size={20} aria-hidden="true" /> Avaliações
        </h2>
        {reviews.loading && <p className="muted">Carregando avaliações...</p>}
        {reviews.data?.length === 0 && (
          <div className="empty-state card">
            <strong>Ainda sem avaliações</strong>
            <p className="muted small">Quem comprar este produto pode avaliar depois do pagamento aprovado.</p>
          </div>
        )}
        <ul className="reviews">
          {reviews.data?.map((r) => (
            <li key={r.id} className="card review">
              <div className="review-head">
                <strong>{r.user.name}</strong>
                <span className="stars" aria-label={`${r.rating} de 5`}>
                  {'★'.repeat(r.rating)}
                  {'☆'.repeat(5 - r.rating)}
                </span>
                <span className="muted small">{formatDate(r.createdAt)}</span>
              </div>
              {r.comment && <p>{r.comment}</p>}
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
