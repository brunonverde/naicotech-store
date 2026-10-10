import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from '../context/AuthContext'
import { mockFetch } from '../test/fetch-mock'
import { AccountPage } from './AccountPage'

const ana = { sub: '1', name: 'Ana', email: 'ana@teste.com', role: 'CUSTOMER' }

const renderAccount = () =>
  render(
    <MemoryRouter initialEntries={['/conta']}>
      <AuthProvider>
        <Routes>
          <Route path="/conta" element={<AccountPage />} />
          <Route path="/" element={<p>Loja</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )

describe('minha conta', () => {
  it('só exclui depois de digitar EXCLUIR, com a senha, e volta para a loja', async () => {
    const fetchMock = mockFetch({
      'GET /auth/me': { body: ana },
      'GET /addresses': { body: [] },
      'POST /account/delete': { body: { deleted: true } },
      'POST /auth/logout': { status: 401 },
    })
    const user = userEvent.setup()
    renderAccount()

    const button = await screen.findByRole('button', { name: 'Excluir conta definitivamente' })
    const [, deletePassword] = screen.getAllByLabelText('Confirme sua senha')
    await user.type(deletePassword, 'senhaForte123')
    expect(button).toBeDisabled()

    await user.type(screen.getByLabelText(/para confirmar/), 'excluir')
    await user.click(button)
    expect(await screen.findByText('Loja')).toBeInTheDocument()

    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/account/delete'))
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ password: 'senhaForte123', confirm: 'EXCLUIR' })
  })

  it('mostra os endereços salvos só mascarados', async () => {
    mockFetch({
      'GET /auth/me': { body: ana },
      'GET /addresses': {
        body: [{ id: 'a1', recipient: 'Maria', line: 'Avenid•••, 1•••', city: 'Rio de Janeiro/RJ', postalCode: '22041-•••', createdAt: '' }],
      },
    })
    renderAccount()
    expect(await screen.findByText(/Avenid•••/)).toBeInTheDocument()
  })
})
