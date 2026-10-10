import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { Category, Product } from '../api/types'
import { categoryIcon } from '../utils/categoryIcon'

export function CategoryTiles({ categories, products }: { categories: Category[]; products: Product[] }) {
  if (!categories.length) return null

  return (
    <section className="section">
      <h2 className="section-title">Navegue por categoria</h2>
      <div className="category-tiles">
        {categories.map((c, i) => {
          const Icon = categoryIcon(c.slug)
          const count = products.filter((p) => p.categoryId === c.id).length
          return (
            <Link
              key={c.id}
              to={`/?categoria=${c.slug}#catalogo`}
              className="category-tile reveal"
              style={{ '--i': i } as CSSProperties}
            >
              <span className="category-tile-icon">
                <Icon size={30} strokeWidth={1.6} aria-hidden="true" />
              </span>
              <strong>{c.name}</strong>
              <span className="muted small">
                {count} {count === 1 ? 'produto' : 'produtos'}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
