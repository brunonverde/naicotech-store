import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '../api/endpoints'
import { PasswordInput } from '../components/PasswordInput'
import { useAuth } from '../context/AuthContext'

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { startSession } = useAuth()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('As senhas não conferem')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const { user } = await authApi.resetPassword(token, password)
      startSession(user)
      navigate('/', { replace: true, state: { passwordChanged: true } })
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <section className="auth-box card">
        <h1>Criar nova senha</h1>
        <p className="alert alert-error">Link de redefinição incompleto.</p>
        <Link to="/esqueci-senha">Pedir um novo link</Link>
      </section>
    )
  }

  return (
    <section className="auth-box card">
      <h1>Criar nova senha</h1>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Nova senha <small className="muted">(mínimo 8 caracteres)</small>
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
          Confirmar nova senha
          <PasswordInput
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        {error && (
          <p className="alert alert-error">
            {error} {error.includes('expirado') && <Link to="/esqueci-senha">Pedir novo link</Link>}
          </p>
        )}
        <button type="submit" className="button" disabled={submitting}>
          {submitting ? 'Salvando...' : 'Salvar nova senha e entrar'}
        </button>
      </form>
      <p className="muted small">Por segurança, todas as sessões abertas da sua conta serão encerradas.</p>
    </section>
  )
}
