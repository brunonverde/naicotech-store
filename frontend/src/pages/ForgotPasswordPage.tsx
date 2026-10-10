import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '../api/endpoints'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sentMessage, setSentMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await authApi.forgotPassword(email)
      setSentMessage(res.message)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="auth-box card">
      <h1>Esqueci minha senha</h1>
      {sentMessage ? (
        <>
          <p className="alert alert-success">{sentMessage}</p>
          <p className="muted small">
            O link vale por 1 hora. Não chegou? Confira o spam ou peça de novo em 1 minuto.
          </p>
          <button type="button" className="link-button" onClick={() => setSentMessage(null)}>
            Enviar de novo
          </button>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="form">
          <p className="muted">Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha.</p>
          <label>
            E-mail
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {error && <p className="alert alert-error">{error}</p>}
          <button type="submit" className="button" disabled={submitting}>
            {submitting ? 'Enviando...' : 'Enviar link'}
          </button>
        </form>
      )}
      <p className="muted">
        <Link to="/login">Voltar para o login</Link>
      </p>
    </section>
  )
}
