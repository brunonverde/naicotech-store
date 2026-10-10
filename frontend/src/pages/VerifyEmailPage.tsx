import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '../api/endpoints'
import { ResendVerification } from '../components/ResendVerification'
import { useAuth } from '../context/AuthContext'

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { startSession } = useAuth()
  const navigate = useNavigate()

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [email, setEmail] = useState('')
  const [resendFor, setResendFor] = useState<string | null>(null)

  // A confirmação acontece no clique, não ao abrir a página: antivírus de e-mail
  // costumam abrir os links sozinhos e confirmariam a conta no lugar da pessoa.
  async function confirm() {
    setError(null)
    setSubmitting(true)
    try {
      const { user } = await authApi.verifyEmail(token)
      startSession(user)
      navigate('/', { replace: true, state: { welcome: true } })
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  function handleResend(e: FormEvent) {
    e.preventDefault()
    setResendFor(email)
  }

  return (
    <section className="auth-box card">
      <h1>Confirmar e-mail</h1>

      {token && !error && (
        <>
          <p>Clique no botão abaixo para ativar sua conta. Você entra automaticamente.</p>
          <button type="button" className="button" disabled={submitting} onClick={confirm}>
            {submitting ? 'Confirmando...' : 'Confirmar minha conta'}
          </button>
        </>
      )}

      {(!token || error) && (
        <>
          <p className="alert alert-error">{error ?? 'Link de confirmação incompleto.'}</p>
          <form onSubmit={handleResend} className="form">
            <label>
              Seu e-mail
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {!resendFor && (
              <button type="submit" className="button">
                Quero um novo link
              </button>
            )}
          </form>
          {resendFor && <ResendVerification key={resendFor} email={resendFor} autoSend />}
          <p className="muted">
            <Link to="/login">Voltar para o login</Link>
          </p>
        </>
      )}
    </section>
  )
}
