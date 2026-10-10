import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from '../context/AuthContext'
import { mockFetch } from '../test/fetch-mock'
import { LoginPage } from './LoginPage'
import { RegisterPage } from './RegisterPage'
import { ResetPasswordPage } from './ResetPasswordPage'

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<p>Loja</p>} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cadastro" element={<RegisterPage />} />
          <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )

const ana = { sub: '1', name: 'Ana', email: 'ana@teste.com', role: 'CUSTOMER' }

describe('login', () => {
  it('entra e volta para a loja', async () => {
    mockFetch({ 'GET /auth/me': { status: 401 }, 'POST /auth/login': { body: { user: ana } } })
    renderAt('/login')
    await userEvent.type(screen.getByLabelText('E-mail'), 'ana@teste.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'senhaForte123')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('Loja')).toBeInTheDocument()
  })

  it('conta não confirmada: mostra aviso e botão de reenvio', async () => {
    mockFetch({
      'GET /auth/me': { status: 401 },
      'POST /auth/login': { status: 403, body: { code: 'EMAIL_NOT_VERIFIED', message: 'Confirme seu e-mail' } },
    })
    renderAt('/login')
    await userEvent.type(screen.getByLabelText('E-mail'), 'ana@teste.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'senhaForte123')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('Confirme seu e-mail')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reenviar e-mail/ })).toBeInTheDocument()
  })

  it('tem link de "Esqueci minha senha"', async () => {
    mockFetch({ 'GET /auth/me': { status: 401 } })
    renderAt('/login')
    expect(screen.getByRole('link', { name: 'Esqueci minha senha' })).toHaveAttribute('href', '/esqueci-senha')
  })
})

describe('cadastro', () => {
  it('não envia se as senhas não conferem', async () => {
    const fetchMock = mockFetch({ 'GET /auth/me': { status: 401 } })
    renderAt('/cadastro')
    await userEvent.type(screen.getByLabelText('Nome'), 'Ana')
    await userEvent.type(screen.getByLabelText('E-mail'), 'ana@teste.com')
    await userEvent.type(screen.getByLabelText(/^Senha/), 'senhaForte123')
    await userEvent.type(screen.getByLabelText('Confirmar senha'), 'outraSenha123')
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(screen.getByText('As senhas não conferem')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/auth/register'))).toBe(false)
  })

  it('depois de cadastrar, pede para confirmar o e-mail', async () => {
    mockFetch({ 'GET /auth/me': { status: 401 }, 'POST /auth/register': { status: 201, body: { message: 'ok' } } })
    renderAt('/cadastro')
    await userEvent.type(screen.getByLabelText('Nome'), 'Ana')
    await userEvent.type(screen.getByLabelText('E-mail'), 'Ana@Teste.com')
    await userEvent.type(screen.getByLabelText(/^Senha/), 'senhaForte123')
    await userEvent.type(screen.getByLabelText('Confirmar senha'), 'senhaForte123')
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(await screen.findByText('Confirme seu e-mail')).toBeInTheDocument()
    expect(screen.getByText('ana@teste.com')).toBeInTheDocument()
  })
})

describe('redefinir senha', () => {
  it('salva a nova senha e entra', async () => {
    mockFetch({ 'GET /auth/me': { status: 401 }, 'POST /auth/reset-password': { body: { user: ana } } })
    renderAt('/redefinir-senha?token=token-de-teste-com-tamanho-ok')
    await userEvent.type(screen.getByLabelText(/^Nova senha/), 'novaSenha456')
    await userEvent.type(screen.getByLabelText('Confirmar nova senha'), 'novaSenha456')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nova senha e entrar' }))
    expect(await screen.findByText('Loja')).toBeInTheDocument()
  })

  it('link expirado oferece pedir outro', async () => {
    mockFetch({
      'GET /auth/me': { status: 401 },
      'POST /auth/reset-password': { status: 400, body: { message: 'Link inválido ou expirado.' } },
    })
    renderAt('/redefinir-senha?token=token-de-teste-com-tamanho-ok')
    await userEvent.type(screen.getByLabelText(/^Nova senha/), 'novaSenha456')
    await userEvent.type(screen.getByLabelText('Confirmar nova senha'), 'novaSenha456')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nova senha e entrar' }))
    expect(await screen.findByRole('link', { name: 'Pedir novo link' })).toBeInTheDocument()
  })

  it('sem token, mostra erro', () => {
    mockFetch({ 'GET /auth/me': { status: 401 } })
    renderAt('/redefinir-senha')
    expect(screen.getByText('Link de redefinição incompleto.')).toBeInTheDocument()
  })
})
