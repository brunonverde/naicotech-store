import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Download, MapPin, Trash2, UserX } from 'lucide-react'
import { accountApi, addressesApi } from '../api/endpoints'
import type { SavedAddress } from '../api/types'
import { PasswordInput } from '../components/PasswordInput'
import { useAuth } from '../context/AuthContext'

// "Minha conta": dados, endereços salvos e os direitos da LGPD (baixar e excluir dados).
export function AccountPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    addressesApi
      .list()
      .then((list) => active && setAddresses(list))
      .catch((err: Error) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [])

  async function removeAddress(id: string) {
    if (!window.confirm('Apagar este endereço salvo?')) return
    try {
      await addressesApi.remove(id)
      setAddresses((list) => list.filter((a) => a.id !== id))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (!user) return null

  return (
    <section className="account-page">
      <h1>Minha conta</h1>
      <div className="card account-card">
        <p>
          <strong>{user.name}</strong>
          <br />
          <span className="muted">{user.email}</span>
        </p>
        <p className="small">
          <Link to="/pedidos">Ver meus pedidos</Link> · <Link to="/esqueci-senha">Trocar senha</Link>
        </p>
      </div>

      <div className="card account-card">
        <h2>
          <MapPin size={20} aria-hidden="true" /> Endereços salvos
        </h2>
        {error && <p className="alert alert-error">{error}</p>}
        {addresses.length ? (
          <ul className="saved-addresses">
            {addresses.map((a) => (
              <li key={a.id} className="saved-address">
                <span>
                  <strong>{a.recipient}</strong> · {a.line}
                  <span className="muted small">
                    {' '}
                    {a.city} · CEP {a.postalCode}
                  </span>
                </span>
                <button type="button" className="link-button danger" onClick={() => removeAddress(a.id)} aria-label="Apagar endereço">
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">Nenhum endereço salvo. Você pode salvar um ao finalizar uma compra.</p>
        )}
        <p className="muted small">Endereços ficam criptografados e aparecem mascarados por segurança.</p>
      </div>

      <ExportData />
      <DeleteAccount
        onDeleted={async () => {
          // A sessão já foi encerrada no servidor; o logout só limpa a tela.
          await logout().catch(() => undefined)
          navigate('/', { replace: true })
        }}
      />
    </section>
  )
}

function ExportData() {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const data = await accountApi.exportData(password)
      // Gera o arquivo no próprio navegador: nada fica salvo no servidor.
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `naicotech-meus-dados-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      setPassword('')
      setMessage({ kind: 'success', text: 'Arquivo baixado. Guarde em local seguro: ele contém seus dados completos.' })
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card account-card form" onSubmit={submit}>
      <h2>
        <Download size={20} aria-hidden="true" /> Baixar meus dados
      </h2>
      <p className="muted small">
        Uma cópia de tudo o que a loja guarda sobre você (conta, endereços, pedidos e avaliações), em um arquivo JSON.
      </p>
      <label>
        Confirme sua senha
        <PasswordInput autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {message && <p className={`alert alert-${message.kind}`}>{message.text}</p>}
      <button type="submit" className="button button-ghost" disabled={busy}>
        {busy ? 'Preparando...' : 'Baixar meus dados'}
      </button>
    </form>
  )
}

function DeleteAccount({ onDeleted }: { onDeleted: () => Promise<void> }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await accountApi.deleteAccount(password, confirm.trim().toUpperCase())
      await onDeleted()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form className="card account-card form danger-zone" onSubmit={submit}>
      <h2>
        <UserX size={20} aria-hidden="true" /> Excluir minha conta
      </h2>
      <p className="small">
        Apaga seu nome, e-mail, endereços e avaliações. Pedidos antigos continuam registrados <strong>sem</strong> nada que
        identifique você, porque a loja precisa deles para fins fiscais. <strong>Não dá para desfazer.</strong>
      </p>
      <label>
        Confirme sua senha
        <PasswordInput autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label>
        <span>
          Digite <strong>EXCLUIR</strong> para confirmar
        </span>
        <input required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
      </label>
      {error && <p className="alert alert-error">{error}</p>}
      <button type="submit" className="button button-danger" disabled={busy || confirm.trim().toUpperCase() !== 'EXCLUIR'}>
        {busy ? 'Excluindo...' : 'Excluir conta definitivamente'}
      </button>
    </form>
  )
}
