import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from '../../context/AuthContext'
import { mockFetch } from '../../test/fetch-mock'
import { AdminPage } from './AdminPage'

const renderAdmin = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <AdminPage />
      </AuthProvider>
    </MemoryRouter>,
  )

const admin = { sub: '1', name: 'Admin', email: 'admin@teste.com', role: 'ADMIN' }

describe('painel de admin', () => {
  it('quem não é admin não vê nada do painel', async () => {
    const fetchMock = mockFetch({
      'GET /auth/me': { body: { ...admin, role: 'CUSTOMER' } },
    })
    renderAdmin()
    expect(await screen.findByText(/Página não encontrada/)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/admin/'))).toBe(false)
  })

  it('admin sem verificação em duas etapas vai para o cadastro do autenticador', async () => {
    mockFetch({
      'GET /auth/me': { body: admin },
      'GET /admin/2fa/status': { body: { enabled: false, lockedUntil: null, recoveryCodesLeft: 0 } },
    })
    renderAdmin()
    expect(await screen.findByText('Proteja o painel')).toBeInTheDocument()
  })

  it('com 2FA ativa mas sem sessão do painel, pede o código', async () => {
    mockFetch({
      'GET /auth/me': { body: admin },
      'GET /admin/2fa/status': { body: { enabled: true, lockedUntil: null, recoveryCodesLeft: 10 } },
      'GET /admin/products': { status: 403, body: { code: 'ADMIN_2FA_REQUIRED', message: 'Confirme o código' } },
    })
    renderAdmin()
    expect(await screen.findByText('Verificação do painel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /código de recuperação/ })).toBeInTheDocument()
  })
})
