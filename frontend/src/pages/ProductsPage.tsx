import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { CreditCard, Lock, PackageCheck, ShieldCheck, SlidersHorizontal, X } from 'lucide-react'
import { catalogApi } from '../api/endpoints'
import type { Condition } from '../api/types'
import { CategoryTiles } from '../components/CategoryTiles'
import { HeroCarousel } from '../components/HeroCarousel'
import { ProductCard } from '../components/ProductCard'
import { ProductSkeletonGrid } from '../components/ProductSkeleton'
import { useAsync } from '../utils/useAsync'

type Sort = 'recentes' | 'menor-preco' | 'maior-preco' | 'nome'

const SORTS: { value: Sort; label: string }[] = [
  { value: 'recentes', label: 'Mais recentes' },
  { value: 'menor-preco', label: 'Menor preço' },
  { value: 'maior-preco', label: 'Maior preço' },
  { value: 'nome', label: 'Nome (A-Z)' },
]

const TRUST = [
  { Icon: ShieldCheck, title: 'Pagamento seguro', text: 'Processado pelo Mercado Pago' },
  { Icon: CreditCard, title: 'Até 12x no cartão', text: 'Crédito ou débito' },
  { Icon: Lock, title: 'Dados protegidos', text: 'Cartão nunca passa pela loja' },
  { Icon: PackageCheck, title: 'Novos e usados', text: 'Condição informada em cada item' },
]

export function ProductsPage() {
  const location = useLocation()
  const state = location.state as { welcome?: boolean; passwordChanged?: boolean } | null
  const [params, setParams] = useSearchParams()
  const products = useAsync(catalogApi.products, [])
  const categories = useAsync(catalogApi.categories, [])
  const [filtersOpen, setFiltersOpen] = useState(false)

  const q = params.get('q') ?? ''
  const categorySlug = params.get('categoria') ?? ''
  const condition = (params.get('condicao') ?? '') as Condition | ''
  const sort = (params.get('ordem') ?? 'recentes') as Sort
  const inStockOnly = params.get('estoque') === '1'
  const minPrice = params.get('min') ?? ''
  const maxPrice = params.get('max') ?? ''
  const hasFilters = Boolean(q || categorySlug || condition || inStockOnly || minPrice || maxPrice)

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true, preventScrollReset: true })
  }

  const category = categories.data?.find((c) => c.slug === categorySlug)

  // O catálogo é pequeno, então filtro e ordenação acontecem no navegador.
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const min = minPrice ? Number(minPrice) : 0
    const max = maxPrice ? Number(maxPrice) : Infinity
    const list = (products.data ?? []).filter((p) => {
      const price = Number(p.price)
      return (
        (!term || `${p.name} ${p.category.name}`.toLowerCase().includes(term)) &&
        (!categorySlug || p.category.slug === categorySlug) &&
        (!condition || p.condition === condition) &&
        (!inStockOnly || p.stock > 0) &&
        price >= min &&
        price <= max
      )
    })
    const byPrice = (a: (typeof list)[number], b: (typeof list)[number]) => Number(a.price) - Number(b.price)
    if (sort === 'menor-preco') list.sort(byPrice)
    else if (sort === 'maior-preco') list.sort((a, b) => byPrice(b, a))
    else if (sort === 'nome') list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    return list
  }, [products.data, q, categorySlug, condition, inStockOnly, minPrice, maxPrice, sort])

  // Links do topo apontam para #catalogo: rola até a vitrine depois que ela aparece.
  useEffect(() => {
    if (location.hash === '#catalogo' && products.data) {
      document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [location.hash, location.search, products.data])

  const title = category ? category.name : q ? `Resultados para "${q}"` : 'Todos os produtos'

  return (
    <>
      {state?.passwordChanged && (
        <p className="alert alert-success">Senha alterada! Você já entrou com a nova senha.</p>
      )}
      {state?.welcome && (
        <p className="alert alert-success">E-mail confirmado! Sua conta está ativa e você já entrou.</p>
      )}

      {!hasFilters && (
        <>
          <HeroCarousel />
          <div className="trust-strip">
            {TRUST.map(({ Icon, title: t, text }) => (
              <div key={t} className="trust-item">
                <Icon size={26} strokeWidth={1.6} aria-hidden="true" />
                <div>
                  <strong>{t}</strong>
                  <span className="muted small">{text}</span>
                </div>
              </div>
            ))}
          </div>
          {categories.data && products.data && (
            <CategoryTiles categories={categories.data} products={products.data} />
          )}
        </>
      )}

      <section id="catalogo" className="section catalog">
        <aside className={`filters-panel card ${filtersOpen ? 'open' : ''}`} aria-label="Filtros">
          <div className="filters-head">
            <h2>
              <SlidersHorizontal size={18} aria-hidden="true" /> Filtros
            </h2>
            <button
              type="button"
              className="link-button show-sm"
              onClick={() => setFiltersOpen(false)}
              aria-label="Fechar filtros"
            >
              <X size={18} />
            </button>
          </div>

          <fieldset>
            <legend>Categoria</legend>
            <label className="radio">
              <input type="radio" name="cat" checked={!categorySlug} onChange={() => setParam('categoria', '')} />
              Todas
            </label>
            {categories.data?.map((c) => (
              <label key={c.id} className="radio">
                <input
                  type="radio"
                  name="cat"
                  checked={categorySlug === c.slug}
                  onChange={() => setParam('categoria', c.slug)}
                />
                {c.name}
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>Condição</legend>
            {(['', 'NEW', 'USED'] as const).map((c) => (
              <label key={c || 'all'} className="radio">
                <input type="radio" name="cond" checked={condition === c} onChange={() => setParam('condicao', c)} />
                {c === '' ? 'Novo e usado' : c === 'NEW' ? 'Novo' : 'Usado'}
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>Preço (R$)</legend>
            <div className="price-range">
              <input
                type="number"
                min={0}
                placeholder="Mín."
                aria-label="Preço mínimo"
                value={minPrice}
                onChange={(e) => setParam('min', e.target.value)}
              />
              <span className="muted">até</span>
              <input
                type="number"
                min={0}
                placeholder="Máx."
                aria-label="Preço máximo"
                value={maxPrice}
                onChange={(e) => setParam('max', e.target.value)}
              />
            </div>
          </fieldset>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setParam('estoque', e.target.checked ? '1' : '')}
            />
            Só com estoque
          </label>

          {hasFilters && (
            <button
              type="button"
              className="button button-ghost button-block"
              onClick={() => setParams({}, { replace: true })}
            >
              Limpar filtros
            </button>
          )}
        </aside>

        <div className="catalog-main">
          <div className="catalog-toolbar">
            <div>
              <h2 className="section-title">{title}</h2>
              {products.data && (
                <span className="muted small">
                  {filtered.length} {filtered.length === 1 ? 'produto encontrado' : 'produtos encontrados'}
                </span>
              )}
            </div>
            <div className="catalog-actions">
              <button type="button" className="button button-ghost show-sm" onClick={() => setFiltersOpen(true)}>
                <SlidersHorizontal size={16} aria-hidden="true" /> Filtros
              </button>
              <label className="sort">
                <span className="muted small hide-sm">Ordenar por</span>
                <select
                  value={sort}
                  onChange={(e) => setParam('ordem', e.target.value === 'recentes' ? '' : e.target.value)}
                >
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {products.loading && <ProductSkeletonGrid />}
          {products.error && <p className="alert alert-error">{products.error}</p>}
          {products.data && filtered.length === 0 && (
            <div className="empty-state card">
              <strong>Nenhum produto encontrado</strong>
              <p className="muted">Tente outros termos ou limpe os filtros.</p>
            </div>
          )}

          <div className="grid">
            {filtered.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
