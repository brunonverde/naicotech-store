import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { AuthProvider } from '../context/AuthContext'
import { CartProvider } from '../context/CartContext'
import { CONSENT_KEY, CONSENT_VERSION, ConsentProvider } from '../context/ConsentContext'
import { mockFetch } from '../test/fetch-mock'
import { CartPage } from './CartPage'

const ana = { sub: '1', name: 'Ana', email: 'ana@teste.com', role: 'CUSTOMER' }
const OPTIONS = [
  { serviceId: 1, name: 'PAC', company: 'Correios', companyId: 1, picture: null, price: '30.00', deliveryDays: 7 },
  { serviceId: 2, name: 'SEDEX', company: 'Correios', companyId: 1, picture: null, price: '55.50', deliveryDays: 2 },
]

const renderCart = () =>
  render(
    <MemoryRouter initialEntries={['/carrinho']}>
      <ConsentProvider>
        <AuthProvider>
          <CartProvider>
            <Routes>
              <Route path="/carrinho" element={<CartPage />} />
              <Route path="/pedidos/:id" element={<p>Página do pedido</p>} />
            </Routes>
          </CartProvider>
        </AuthProvider>
      </ConsentProvider>
    </MemoryRouter>,
  )

describe('checkout com frete', () => {
  beforeEach(() => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ version: CONSENT_VERSION, decidedAt: '', cart: true }))
    localStorage.setItem(
      'naicotech.cart',
      JSON.stringify([{ productId: 'p1', name: 'RTX 5060 Ti', price: '100.00', image: '', stock: 3, quantity: 1 }]),
    )
  })

  it('preenche o endereço pelo CEP, escolhe o frete e envia só o ID do serviço', async () => {
    const fetchMock = mockFetch({
      'GET /auth/me': { body: ana },
      'GET /addresses': { body: [] },
      'GET /shipping/cep/22041001': {
        body: { postalCode: '22041001', street: 'Avenida Atlântica', district: 'Copacabana', city: 'Rio de Janeiro', state: 'RJ' },
      },
      'POST /shipping/quote': { body: OPTIONS },
      'POST /orders': { status: 201, body: { id: 'pedido-1' } },
    })
    const user = userEvent.setup()
    renderCart()

    await user.type(await screen.findByLabelText('CEP'), '22041001')
    expect(await screen.findByDisplayValue('Avenida Atlântica')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Nome de quem recebe/), 'Maria da Silva')
    await user.type(screen.getByLabelText('Número'), '1702')
    await user.type(screen.getByLabelText(/CPF/), '52998224725')
    await user.type(screen.getByLabelText('Celular'), '21988887777')

    // A mais barata vem marcada; troca para SEDEX e o total acompanha.
    await user.click(await screen.findByLabelText(/Correios SEDEX/))
    expect(screen.getByText('R$ 155,50')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Finalizar pedido' }))
    expect(await screen.findByText('Página do pedido')).toBeInTheDocument()

    const call = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/orders') && init?.method === 'POST')
    const body = JSON.parse(String(call?.[1]?.body))
    expect(body).toMatchObject({ shippingServiceId: 2, saveAddress: false, address: { postalCode: '22041-001', state: 'RJ' } })
    expect(body).not.toHaveProperty('shippingPrice')
  })

  it('usa o endereço salvo (mascarado) sem pedir o CEP de novo', async () => {
    const fetchMock = mockFetch({
      'GET /auth/me': { body: ana },
      'GET /addresses': {
        body: [{ id: 'a1', recipient: 'Maria', line: 'Avenid•••, 1•••', city: 'Rio de Janeiro/RJ', postalCode: '22041-•••', createdAt: '' }],
      },
      'POST /shipping/quote/address': { body: OPTIONS },
    })
    renderCart()

    expect(await screen.findByText(/Avenid•••/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Finalizar pedido' })).toBeEnabled())
    expect(screen.queryByLabelText('CEP')).not.toBeInTheDocument()
    const quote = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/shipping/quote/address'))
    expect(JSON.parse(String(quote?.[1]?.body))).toMatchObject({ addressId: 'a1' })
  })
})
