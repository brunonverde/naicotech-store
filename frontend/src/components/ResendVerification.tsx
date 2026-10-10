import { useEffect, useRef, useState } from 'react'
import { authApi } from '../api/endpoints'

const COOLDOWN_SECONDS = 60

interface Props {
  email: string
  // Envia assim que aparece (quando a pessoa já pediu um novo link).
  autoSend?: boolean
  // Segundos de espera iniciais, quando um e-mail acabou de ser enviado.
  initialCooldown?: number
}

export function ResendVerification({ email, autoSend = false, initialCooldown = 0 }: Props) {
  const [cooldown, setCooldown] = useState(initialCooldown)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const autoSent = useRef(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function resend() {
    setError(null)
    setMessage(null)
    setCooldown(COOLDOWN_SECONDS)
    try {
      const res = await authApi.resendVerification(email)
      setMessage(res.message)
    } catch (err) {
      setError((err as Error).message)
      setCooldown(0)
    }
  }

  useEffect(() => {
    // O ref evita envio duplo no StrictMode (efeitos rodam duas vezes em dev).
    if (autoSend && !autoSent.current) {
      autoSent.current = true
      void resend()
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend])

  return (
    <div className="resend">
      <button type="button" className="link-button" disabled={cooldown > 0} onClick={resend}>
        {cooldown > 0 ? `Reenviar e-mail (${cooldown}s)` : 'Reenviar e-mail de confirmação'}
      </button>
      {message && <p className="muted small">{message}</p>}
      {error && <p className="alert alert-error">{error}</p>}
    </div>
  )
}
