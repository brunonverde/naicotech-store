import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { PasswordInput } from '../components/PasswordInput'
import { ResendVerification } from '../components/ResendVerification'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as { from?: string } | null

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [unverified, setUnverified] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setUnverified(false)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate(state?.from ?? '/', { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setUnverified(err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="auth-box card">
      <h1>Entrar</h1>
      <form onSubmit={handleSubmit} className="form">
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
          Senha
          <PasswordInput
            autoComplete="current-password"
            required
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <Link to="/esqueci-senha" className="small forgot-link">
          Esqueci minha senha
        </Link>
        {error && <p className={`alert ${unverified ? 'alert-info' : 'alert-error'}`}>{error}</p>}
        {unverified && <ResendVerification key={email} email={email} />}
        <button type="submit" className="button" disabled={submitting}>
          {submitting ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
      <p className="muted">
        Não tem conta? <Link to="/cadastro">Cadastre-se</Link>
      </p>
    </section>
  )
}
