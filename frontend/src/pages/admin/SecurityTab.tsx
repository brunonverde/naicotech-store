import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { adminApi } from '../../api/endpoints'
import type { AuditEntry } from '../../api/types'
import { PasswordInput } from '../../components/PasswordInput'
import { formatDate } from '../../utils/format'
import { useAdminSession } from './adminSession'
import { RecoveryCodes } from './RecoveryCodes'

type Action = 'codes' | 'reset' | null

export function SecurityTab({ onAuthenticatorReset }: { onAuthenticatorReset: () => void }) {
  const { guard } = useAdminSession()
  const [log, setLog] = useState<AuditEntry[]>([])
  const [action, setAction] = useState<Action>(null)
  const [password, setPassword] = useState('')
  const [newCodes, setNewCodes] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLog(await guard(adminApi.auditLog()))
    } catch (err) {
      setError((err as Error).message)
    }
  }, [guard])

  useEffect(() => {
    // Busca dados da API (sistema externo); o setState acontece depois do await.
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  async function confirm(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (action === 'codes') {
        const res = await guard(adminApi.regenerateCodes(password))
        setNewCodes(res.recoveryCodes)
      } else if (action === 'reset') {
        await guard(adminApi.reset(password))
        onAuthenticatorReset()
        return
      }
      setAction(null)
      setPassword('')
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (newCodes) {
    return (
      <div className="card admin-form">
        <RecoveryCodes codes={newCodes} onDone={() => setNewCodes(null)} />
      </div>
    )
  }

  return (
    <div>
      <div className="card admin-form">
        <h2>Verificação em duas etapas</h2>
        <p className="muted">
          Ativa. Os códigos antigos de recuperação deixam de valer quando você gera novos.
        </p>
        {action ? (
          <form onSubmit={confirm} className="form">
            <p>
              {action === 'codes'
                ? 'Confirme sua senha para gerar 10 novos códigos de recuperação.'
                : 'Confirme sua senha para remover o autenticador atual e cadastrar outro celular.'}
            </p>
            <PasswordInput
              aria-label="Senha"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="alert alert-error">{error}</p>}
            <div className="form-actions">
              <button type="submit" className={`button ${action === 'reset' ? 'button-danger' : ''}`}>
                Confirmar
              </button>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setAction(null)
                  setPassword('')
                  setError(null)
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div className="form-actions">
            <button type="button" className="button" onClick={() => setAction('codes')}>
              Gerar novos códigos de recuperação
            </button>
            <button type="button" className="link-button danger" onClick={() => setAction('reset')}>
              Trocar de celular (reconfigurar)
            </button>
          </div>
        )}
      </div>

      <h2>Registro de atividades</h2>
      <p className="muted small">Últimas 200 ações de admins e tentativas de acesso ao painel.</p>
      <div className="table-wrap card">
        <table className="table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Quem</th>
              <th>Ação</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {log.map((e) => (
              <tr key={e.id}>
                <td className="nowrap">{formatDate(e.createdAt)}</td>
                <td>{e.user.email}</td>
                <td>
                  {e.action}
                  {e.target && <span className="muted small mono"> {e.target.slice(0, 8)}</span>}
                </td>
                <td className="muted small mono">{e.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
