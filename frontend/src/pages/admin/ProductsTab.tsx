import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { adminApi, catalogApi } from '../../api/endpoints'
import type { AdminProduct, Category, Condition, ProductInput } from '../../api/types'
import { conditionLabel, formatPrice } from '../../utils/format'
import { useAdminSession } from './adminSession'

interface FormState {
  name: string
  description: string
  price: string
  costPrice: string
  condition: Condition
  stock: string
  categoryId: string
  images: string
  weightGrams: string
  lengthCm: string
  widthCm: string
  heightCm: string
}

const EMPTY: FormState = {
  name: '',
  description: '',
  price: '',
  costPrice: '',
  condition: 'NEW',
  stock: '1',
  categoryId: '',
  images: '',
  // Padrão de uma placa de vídeo na caixa de envio; ajuste pesando o pacote.
  weightGrams: '1500',
  lengthCm: '32',
  widthCm: '22',
  heightCm: '12',
}

function toForm(p: AdminProduct): FormState {
  return {
    name: p.name,
    description: p.description,
    price: String(Number(p.price)),
    costPrice: p.costPrice ? String(Number(p.costPrice)) : '',
    condition: p.condition,
    stock: String(p.stock),
    categoryId: p.categoryId,
    images: p.images.join('\n'),
    weightGrams: String(p.weightGrams),
    lengthCm: String(p.lengthCm),
    widthCm: String(p.widthCm),
    heightCm: String(p.heightCm),
  }
}

function toInput(f: FormState): ProductInput {
  return {
    name: f.name.trim(),
    description: f.description.trim(),
    price: Number(f.price.replace(',', '.')),
    ...(f.costPrice ? { costPrice: Number(f.costPrice.replace(',', '.')) } : {}),
    condition: f.condition,
    stock: Number(f.stock),
    categoryId: f.categoryId,
    images: f.images
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    weightGrams: Number(f.weightGrams),
    lengthCm: Number(f.lengthCm),
    widthCm: Number(f.widthCm),
    heightCm: Number(f.heightCm),
  }
}

export function ProductsTab() {
  const { guard } = useAdminSession()
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [editing, setEditing] = useState<AdminProduct | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([guard(adminApi.products()), catalogApi.categories()])
      setProducts(p)
      setCategories(c)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [guard])

  useEffect(() => {
    // Busca dados da API (sistema externo); o setState acontece depois do await.
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  function openForm(target: AdminProduct | 'new') {
    setEditing(target)
    setForm(target === 'new' ? { ...EMPTY, categoryId: categories[0]?.id ?? '' } : toForm(target))
    setError(null)
    setMessage(null)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const input = toInput(form)
      if (editing === 'new') await guard(adminApi.createProduct(input))
      else if (editing) await guard(adminApi.updateProduct(editing.id, input))
      setMessage(editing === 'new' ? 'Produto criado.' : 'Produto atualizado.')
      setEditing(null)
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(p: AdminProduct) {
    if (!window.confirm(`Apagar "${p.name}"? Essa ação não pode ser desfeita.`)) return
    setError(null)
    try {
      await guard(adminApi.deleteProduct(p.id))
      setMessage('Produto apagado.')
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const set = (field: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  if (editing) {
    return (
      <form onSubmit={save} className="form card admin-form">
        <h2>{editing === 'new' ? 'Novo produto' : 'Editar produto'}</h2>
        <label>
          Nome
          <input required minLength={2} maxLength={150} value={form.name} onChange={set('name')} />
        </label>
        <label>
          Descrição
          <textarea required maxLength={2000} rows={6} value={form.description} onChange={set('description')} />
        </label>
        <div className="form-row">
          <label>
            Preço de venda (R$)
            <input required inputMode="decimal" value={form.price} onChange={set('price')} />
          </label>
          <label>
            Preço de custo (R$) <small className="muted">só admin vê</small>
            <input inputMode="decimal" value={form.costPrice} onChange={set('costPrice')} />
          </label>
        </div>
        <div className="form-row">
          <label>
            Estoque
            <input required type="number" min={0} value={form.stock} onChange={set('stock')} />
          </label>
          <label>
            Condição
            <select value={form.condition} onChange={set('condition')}>
              <option value="NEW">Novo</option>
              <option value="USED">Usado</option>
            </select>
          </label>
          <label>
            Categoria
            <select required value={form.categoryId} onChange={set('categoryId')}>
              <option value="" disabled>
                Escolha
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="form-fieldset">
          <legend>
            Pacote para envio <small className="muted">(caixa já embalada, usada no cálculo do frete)</small>
          </legend>
          <div className="form-row">
            <label>
              Peso (g)
              <input required type="number" min={1} max={30000} value={form.weightGrams} onChange={set('weightGrams')} />
            </label>
            <label>
              Comprimento (cm)
              <input required type="number" min={1} max={100} value={form.lengthCm} onChange={set('lengthCm')} />
            </label>
            <label>
              Largura (cm)
              <input required type="number" min={1} max={100} value={form.widthCm} onChange={set('widthCm')} />
            </label>
            <label>
              Altura (cm)
              <input required type="number" min={1} max={100} value={form.heightCm} onChange={set('heightCm')} />
            </label>
          </div>
        </fieldset>
        <label>
          Imagens <small className="muted">(uma URL https por linha, até 10)</small>
          <textarea rows={3} value={form.images} onChange={set('images')} placeholder="https://..." />
        </label>
        {error && <p className="alert alert-error">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="button" disabled={busy}>
            {busy ? 'Salvando...' : 'Salvar'}
          </button>
          <button type="button" className="link-button" onClick={() => setEditing(null)}>
            Cancelar
          </button>
        </div>
      </form>
    )
  }

  return (
    <div>
      <div className="admin-toolbar">
        <button type="button" className="button" onClick={() => openForm('new')} disabled={!categories.length}>
          Novo produto
        </button>
        {!categories.length && <span className="muted small">Crie uma categoria primeiro.</span>}
      </div>
      {message && <p className="alert alert-success">{message}</p>}
      {error && <p className="alert alert-error">{error}</p>}
      <div className="table-wrap card">
        <table className="table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Venda</th>
              <th>Custo</th>
              <th>Estoque</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.name}
                  <div className="muted small">
                    {p.category.name} · {conditionLabel[p.condition]}
                  </div>
                </td>
                <td>{formatPrice(p.price)}</td>
                <td>{p.costPrice ? formatPrice(p.costPrice) : '—'}</td>
                <td className={p.stock === 0 ? 'danger-text' : ''}>{p.stock}</td>
                <td>
                  <div className="row-actions">
                    <button type="button" className="link-button" onClick={() => openForm(p)}>
                      Editar
                    </button>
                    <button type="button" className="link-button danger" onClick={() => remove(p)}>
                      Apagar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!products.length && <p className="muted empty">Nenhum produto ainda.</p>}
      </div>
    </div>
  )
}
