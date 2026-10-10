import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import type { Product } from '../api/types'
import { CartProvider, useCart } from './CartContext'
import { CONSENT_KEY, CONSENT_VERSION, ConsentProvider } from './ConsentContext'

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'RTX 5060 Ti',
  description: '',
  price: '3799.90',
  condition: 'NEW',
  stock: 3,
  images: ['https://exemplo.com/a.jpg'],
  categoryId: 'c1',
  category: { id: 'c1', name: 'GPU', slug: 'gpu' },
  createdAt: '',
  updatedAt: '',
  ...overrides,
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <ConsentProvider>
    <CartProvider>{children}</CartProvider>
  </ConsentProvider>
)

const allowCartStorage = (cart: boolean) =>
  localStorage.setItem(CONSENT_KEY, JSON.stringify({ version: CONSENT_VERSION, decidedAt: '', cart }))

describe('carrinho', () => {
  it('soma itens e calcula o total', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.add(product(), 2))
    expect(result.current.count).toBe(2)
    expect(result.current.total).toBeCloseTo(7599.8)
  })

  it('nunca passa do estoque', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.add(product({ stock: 2 }), 1))
    act(() => result.current.add(product({ stock: 2 }), 5))
    expect(result.current.items[0].quantity).toBe(2)

    act(() => result.current.setQuantity('p1', 99))
    expect(result.current.items[0].quantity).toBe(2)
    act(() => result.current.setQuantity('p1', 0))
    expect(result.current.items[0].quantity).toBe(1)
  })

  it('remove e limpa', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.add(product()))
    act(() => result.current.add(product({ id: 'p2' })))
    act(() => result.current.remove('p1'))
    expect(result.current.items.map((i) => i.productId)).toEqual(['p2'])
    act(() => result.current.clear())
    expect(result.current.items).toEqual([])
  })

  it('com consentimento, persiste no navegador e sobrevive a dados corrompidos', () => {
    allowCartStorage(true)
    const first = renderHook(() => useCart(), { wrapper })
    act(() => first.result.current.add(product()))
    first.unmount()
    expect(renderHook(() => useCart(), { wrapper }).result.current.count).toBe(1)

    localStorage.setItem('naicotech.cart', '{lixo')
    expect(renderHook(() => useCart(), { wrapper }).result.current.items).toEqual([])
  })

  it('sem consentimento, não grava nada no navegador e apaga o que havia', () => {
    allowCartStorage(false)
    localStorage.setItem('naicotech.cart', JSON.stringify([{ productId: 'antigo', quantity: 1 }]))
    const { result } = renderHook(() => useCart(), { wrapper })
    expect(result.current.items).toEqual([])
    act(() => result.current.add(product()))
    expect(result.current.count).toBe(1)
    expect(localStorage.getItem('naicotech.cart')).toBeNull()
  })

  it('antes de decidir, o carrinho também não é salvo', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.add(product()))
    expect(localStorage.getItem('naicotech.cart')).toBeNull()
  })
})
