import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Product } from '../api/types'
import { readConsent, useConsent } from './ConsentContext'

// O preço aqui é só para exibição; o valor cobrado é calculado no backend.
export interface CartItem {
  productId: string
  name: string
  price: string
  image: string | null
  stock: number
  quantity: number
}

interface CartContextValue {
  items: CartItem[]
  count: number
  total: number
  add: (product: Product, quantity?: number) => void
  setQuantity: (productId: string, quantity: number) => void
  remove: (productId: string) => void
  clear: () => void
}

const CART_KEY = 'naicotech.cart'
const CartContext = createContext<CartContextValue | null>(null)

// Só lê o carrinho salvo se a pessoa permitiu guardá-lo neste navegador.
function loadCart(): CartItem[] {
  if (!readConsent()?.cart) return []
  try {
    const raw = localStorage.getItem(CART_KEY)
    return raw ? (JSON.parse(raw) as CartItem[]) : []
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(loadCart)
  const { consent } = useConsent()
  const remember = Boolean(consent?.cart)

  useEffect(() => {
    try {
      // Sem consentimento o carrinho vive só enquanto a aba estiver aberta, e o salvo é apagado.
      if (remember) localStorage.setItem(CART_KEY, JSON.stringify(items))
      else localStorage.removeItem(CART_KEY)
    } catch {
      // Sem persistência; o carrinho continua funcionando enquanto a aba estiver aberta.
    }
  }, [items, remember])

  const add = useCallback((product: Product, quantity = 1) => {
    setItems((current) => {
      const existing = current.find((i) => i.productId === product.id)
      if (existing) {
        return current.map((i) =>
          i.productId === product.id
            ? {
                ...i,
                stock: product.stock,
                quantity: Math.min(i.quantity + quantity, product.stock),
              }
            : i,
        )
      }
      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          price: product.price,
          image: product.images[0] ?? null,
          stock: product.stock,
          quantity: Math.min(quantity, product.stock),
        },
      ]
    })
  }, [])

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setItems((current) =>
      current.map((i) =>
        i.productId === productId
          ? { ...i, quantity: Math.max(1, Math.min(quantity, i.stock)) }
          : i,
      ),
    )
  }, [])

  const remove = useCallback((productId: string) => {
    setItems((current) => current.filter((i) => i.productId !== productId))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const value = useMemo(() => {
    const count = items.reduce((sum, i) => sum + i.quantity, 0)
    const total = items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0)
    return { items, count, total, add, setQuantity, remove, clear }
  }, [items, add, setQuantity, remove, clear])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart precisa estar dentro de <CartProvider>')
  return ctx
}
