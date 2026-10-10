import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '../api/endpoints'
import { PasswordInput } from '../components/PasswordInput'
import { ResendVerification } from '../components/ResendVerification'

export function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('As senhas não conferem')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await authApi.register(name.trim(), email, password, acceptTerms)
      setRegisteredEmail(email.trim().toLowerCase())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (registeredEmail) {
    return (
      <section className="auth-box card">
        <h1>Confirme seu e-mail</h1>
        <p>
          Enviamos um e-mail para <strong>{registeredEmail}</strong>. Abra e clique em{' '}
          <strong>Validar minha conta</strong> para entrar.
        </p>
        <p className="muted small">Não chegou? Confira o spam ou peça outro envio.</p>
        <ResendVerification email={registeredEmail} initialCooldown={60} />
      </section>
    )
  }

  return (
    <section className="auth-box card">
      <h1>Criar conta</h1>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Nome
          <input
            autoComplete="name"
            required
            minLength={2}
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
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
        <label>
          Senha <small className="muted">(mínimo 8 caracteres)</small>
          <PasswordInput
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          Confirmar senha
          <PasswordInput
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        <label className="checkbox">
          <input type="checkbox" required checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
          <span>
            Li e aceito os <Link to="/termos" target="_blank">Termos de Uso</Link> e a{' '}
            <Link to="/privacidade" target="_blank">Política de Privacidade</Link>
          </span>
        </label>
        {error && <p className="alert alert-error">{error}</p>}
        <button type="submit" className="button" disabled={submitting}>
          {submitting ? 'Criando...' : 'Criar conta'}
        </button>
      </form>
      <p className="muted">
        Já tem conta? <Link to="/login">Entrar</Link>
      </p>
    </section>
  )
}
