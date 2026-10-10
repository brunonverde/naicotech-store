import { useState } from 'react'
import type { FormEvent } from 'react'
import QRCode from 'qrcode'
import { adminApi } from '../../api/endpoints'
import { PasswordInput } from '../../components/PasswordInput'
import { RecoveryCodes } from './RecoveryCodes'

type Step = 'password' | 'scan' | 'codes'

export function TwoFactorSetup({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>('password')
  const [password, setPassword] = useState('')
  const [secret, setSecret] = useState('')
  const [qr, setQr] = useState('')
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function startSetup(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await adminApi.setup(password)
      setPassword('')
      setSecret(res.secret)
      // QR gerado no navegador: o segredo não passa por nenhum serviço externo.
      setQr(await QRCode.toDataURL(res.otpauthUri, { margin: 1, width: 220 }))
      setStep('scan')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await adminApi.enable(code)
      setRecoveryCodes(res.recoveryCodes)
      setSecret('')
      setQr('')
      setStep('codes')
    } catch (err) {
      setError((err as Error).message)
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="auth-box card admin-gate">
      <h1>Proteja o painel</h1>
      {step === 'password' && (
        <form onSubmit={startSetup} className="form">
          <p>
            O painel de admin exige <strong>verificação em duas etapas</strong>: além da senha, um
            código de 6 dígitos gerado no seu celular (Google Authenticator, Microsoft
            Authenticator, Authy...).
          </p>
          <label>
            Confirme sua senha
            <PasswordInput
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="alert alert-error">{error}</p>}
          <button type="submit" className="button" disabled={busy}>
            {busy ? 'Gerando...' : 'Começar'}
          </button>
        </form>
      )}

      {step === 'scan' && (
        <form onSubmit={confirm} className="form">
          <ol className="steps">
            <li>Abra o app autenticador no celular e escaneie o QR code.</li>
            <li>Digite o código de 6 dígitos que aparecer no app.</li>
          </ol>
          {qr && <img src={qr} alt="QR code para o app autenticador" className="qr" width={220} height={220} />}
          <details>
            <summary>Não consegue escanear? Digite a chave</summary>
            <code className="secret mono">{secret.match(/.{1,4}/g)?.join(' ')}</code>
          </details>
          <label>
            Código do app
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          {error && <p className="alert alert-error">{error}</p>}
          <button type="submit" className="button" disabled={busy || code.length !== 6}>
            {busy ? 'Confirmando...' : 'Ativar verificação em duas etapas'}
          </button>
        </form>
      )}

      {step === 'codes' && <RecoveryCodes codes={recoveryCodes} onDone={onDone} />}
    </section>
  )
}
