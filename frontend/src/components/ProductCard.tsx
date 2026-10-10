import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Flame, ShoppingCart } from 'lucide-react'
import type { Product } from '../api/types'
import { useCart } from '../context/CartContext'
import { useToast } from '../context/ToastContext'
import { categoryIcon } from '../utils/categoryIcon'
import { conditionLabel, formatPrice } from '../utils/format'
import { ProductImage } from './ProductImage'

const LOW_STOCK = 3

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const { add, items } = useCart()
  const { notify } = useToast()
  const inCart = items.find((i) => i.productId === product.id)?.quantity ?? 0
  const outOfStock = product.stock === 0
  const maxedOut = !outOfStock && inCart >= product.stock

  function handleAdd() {
    add(product)
    notify('Adicionado ao carrinho', product.name)
  }

  return (
    <article className="product-card reveal" style={{ '--i': index % 12 } as CSSProperties}>
      <Link to={`/produtos/${product.id}`} className="product-card-link">
        <div className="product-card-media">
          <ProductImage
            src={product.images[0]}
            alt={product.name}
            FallbackIcon={categoryIcon(product.category.slug)}
          />
          <div className="product-card-badges">
            <span className={`tag tag-${product.condition.toLowerCase()}`}>{conditionLabel[product.condition]}</span>
            {!outOfStock && product.stock <= LOW_STOCK && (
              <span className="tag tag-hot">
                <Flame size={12} aria-hidden="true" /> Últimas unidades
              </span>
            )}
          </div>
          {outOfStock && <span className="sold-out">Esgotado</span>}
        </div>
        <div className="product-card-body">
          <span className="product-card-category">{product.category.name}</span>
          <h3>{product.name}</h3>
          <div className="product-card-price">
            <span className="price">{formatPrice(product.price)}</span>
            <span className="muted small">ou até 12x no cartão</span>
          </div>
        </div>
      </Link>
      <div className="product-card-footer">
        <button type="button" className="button button-block" disabled={outOfStock || maxedOut} onClick={handleAdd}>
          <ShoppingCart size={18} aria-hidden="true" />
          {outOfStock ? 'Esgotado' : maxedOut ? 'Limite do estoque' : 'Comprar'}
        </button>
      </div>
    </article>
  )
}
