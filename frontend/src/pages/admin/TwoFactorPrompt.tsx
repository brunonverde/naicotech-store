import { useState } from 'react'
import type { FormEvent } from 'react'
import { adminApi } from '../../api/endpoints'

export function TwoFactorPrompt({
  lockedUntil,
  expired,
  onVerified,
}: {
  lockedUntil: string | null
  expired: boolean
  onVerified: (recoveryCodesLeft?: number) => void
}) {
  const [useRecovery, setUseRecovery] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Hora em que a tela abriu (a tela é recriada a cada nova verificação).
  const [openedAt] = useState(() => Date.now())

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await adminApi.verify(code.trim())
      onVerified(res.recoveryCodesLeft)
    } catch (err) {
      setError((err as Error).message)
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  const locked = lockedUntil && new Date(lockedUntil).getTime() > openedAt

  return (
    <section className="auth-box card admin-gate">
      <h1>Verificação do painel</h1>
      {expired && <p className="alert alert-info">Sua sessão do painel expirou. Confirme o código de novo.</p>}
      {locked && (
        <p className="alert alert-error">
          Painel bloqueado por tentativas erradas até{' '}
          {new Date(lockedUntil).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
        </p>
      )}
      <form onSubmit={submit} className="form">
        <label>
          {useRecovery ? 'Código de recuperação' : 'Código de 6 dígitos do app autenticador'}
          {useRecovery ? (
            <input
              autoComplete="off"
              placeholder="XXXXX-XXXXX"
              maxLength={11}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          ) : (
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          )}
        </label>
        {error && <p className="alert alert-error">{error}</p>}
        <button type="submit" className="button" disabled={busy}>
          {busy ? 'Verificando...' : 'Entrar no painel'}
        </button>
      </form>
      <button
        type="button"
        className="link-button small"
        onClick={() => {
          setUseRecovery((v) => !v)
          setCode('')
          setError(null)
        }}
      >
        {useRecovery ? 'Usar o código do app' : 'Perdi o celular: usar código de recuperação'}
      </button>
      <p className="muted small">A sessão do painel dura 30 minutos.</p>
    </section>
  )
}
