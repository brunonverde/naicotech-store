import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { adminApi, catalogApi } from '../../api/endpoints'
import type { Category } from '../../api/types'
import { useAdminSession } from './adminSession'

export function CategoriesTab() {
  const { guard } = useAdminSession()
  const [categories, setCategories] = useState<Category[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setCategories(await catalogApi.categories())
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    // Busca dados da API (sistema externo); o setState acontece depois do await.
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  async function create(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await guard(adminApi.createCategory(name.trim()))
      setName('')
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function remove(c: Category) {
    if (!window.confirm(`Apagar a categoria "${c.name}"?`)) return
    setError(null)
    try {
      await guard(adminApi.deleteCategory(c.id))
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div>
      <form onSubmit={create} className="admin-toolbar">
        <input
          required
          minLength={2}
          maxLength={60}
          placeholder="Nova categoria"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="button">
          Criar
        </button>
      </form>
      {error && <p className="alert alert-error">{error}</p>}
      <ul className="card simple-list">
        {categories.map((c) => (
          <li key={c.id}>
            <span>
              {c.name} <span className="muted small">/{c.slug}</span>
            </span>
            <button type="button" className="link-button danger" onClick={() => remove(c)}>
              Apagar
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
