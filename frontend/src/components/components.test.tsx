import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../context/AuthContext'
import { mockFetch } from '../test/fetch-mock'
import { ErrorBoundary } from './ErrorBoundary'
import { PasswordInput } from './PasswordInput'
import { RequireAuth } from './RequireAuth'

describe('PasswordInput', () => {
  it('mostra e esconde a senha', async () => {
    render(<PasswordInput aria-label="Senha" defaultValue="segredo123" />)
    const input = screen.getByLabelText('Senha')
    expect(input).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(input).toHaveAttribute('type', 'text')

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }))
    expect(input).toHaveAttribute('type', 'password')
  })

  it('o botão não envia o formulário', async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <PasswordInput aria-label="Senha" />
      </form>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('ErrorBoundary', () => {
  it('mostra tela de erro em vez de tela vazia', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const Broken = () => {
      throw new Error('quebrou')
    }
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Algo deu errado nesta tela')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument()
  })
})

describe('RequireAuth', () => {
  const renderProtected = () =>
    render(
      <MemoryRouter initialEntries={['/pedidos']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/pedidos"
              element={
                <RequireAuth>
                  <p>Área logada</p>
                </RequireAuth>
              }
            />
            <Route path="/login" element={<p>Tela de login</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )

  it('sem sessão, manda para o login', async () => {
    mockFetch({ 'GET /auth/me': { status: 401 } })
    renderProtected()
    expect(await screen.findByText('Tela de login')).toBeInTheDocument()
    expect(screen.queryByText('Área logada')).not.toBeInTheDocument()
  })

  it('com sessão válida, mostra a página', async () => {
    mockFetch({
      'GET /auth/me': { body: { sub: '1', name: 'Ana', email: 'a@teste.com', role: 'CUSTOMER' } },
    })
    renderProtected()
    expect(await screen.findByText('Área logada')).toBeInTheDocument()
  })

  it('apaga token antigo do localStorage', async () => {
    localStorage.setItem('naicotech.token', 'jwt-antigo')
    mockFetch({ 'GET /auth/me': { status: 401 } })
    renderProtected()
    await screen.findByText('Tela de login')
    expect(localStorage.getItem('naicotech.token')).toBeNull()
  })
})
