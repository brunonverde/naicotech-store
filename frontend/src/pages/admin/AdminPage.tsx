import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../../api/endpoints'
import type { TwoFactorStatus } from '../../api/types'
import { useAuth } from '../../context/AuthContext'
import { AdminDashboard } from './AdminDashboard'
import { TwoFactorPrompt } from './TwoFactorPrompt'
import { TwoFactorSetup } from './TwoFactorSetup'

type Stage = 'loading' | 'setup' | 'prompt' | 'panel'

export function AdminPage() {
  const { user } = useAuth()
  const [status, setStatus] = useState<TwoFactorStatus | null>(null)
  const [stage, setStage] = useState<Stage>('loading')
  const [expired, setExpired] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isAdmin = user?.role === 'ADMIN'

  const loadStatus = useCallback(async (opts: { tryPanel: boolean }) => {
    setError(null)
    try {
      const s = await adminApi.status()
      setStatus(s)
      if (!s.enabled) return setStage('setup')
      if (!opts.tryPanel) return setStage('prompt')
      // Se já houver sessão de painel válida (ex.: recarregou a página), entra direto.
      try {
        await adminApi.products()
        setStage('panel')
      } catch {
        setStage('prompt')
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    // Busca o status na API (sistema externo); o setState acontece depois do await.
    // oxlint-disable-next-line react/set-state-in-effect
    if (isAdmin) void loadStatus({ tryPanel: true })
  }, [isAdmin, loadStatus])

  // Não revela nada do painel para quem não é admin.
  if (!isAdmin) {
    return (
      <p>
        Página não encontrada. <Link to="/">Voltar</Link>
      </p>
    )
  }
  if (error) return <p className="alert alert-error">{error}</p>
  if (stage === 'loading') return <p className="muted">Carregando...</p>

  if (stage === 'setup') return <TwoFactorSetup onDone={() => setStage('panel')} />
  if (stage === 'prompt') {
    return (
      <TwoFactorPrompt
        lockedUntil={status?.lockedUntil ?? null}
        expired={expired}
        onVerified={(left) => {
          setExpired(false)
          setNotice(
            left !== undefined
              ? `Você entrou com um código de recuperação. Restam ${left}. Se perdeu o celular, reconfigure o autenticador na aba Segurança.`
              : null,
          )
          setStage('panel')
        }}
      />
    )
  }

  return (
    <AdminDashboard
      notice={notice}
      onStepUpRequired={() => {
        setExpired(true)
        void loadStatus({ tryPanel: false })
      }}
      onAuthenticatorReset={() => {
        setNotice(null)
        void loadStatus({ tryPanel: false })
      }}
      onEndSession={async () => {
        await adminApi.end().catch(() => undefined)
        setExpired(false)
        setStage('prompt')
      }}
    />
  )
}
