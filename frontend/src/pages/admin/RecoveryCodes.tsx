import { useState } from 'react'

export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="recovery">
      <h2>Códigos de recuperação</h2>
      <p>
        Guarde estes códigos num lugar seguro (gerenciador de senhas ou papel). Cada um permite
        entrar no painel <strong>uma vez</strong> se você perder o celular.{' '}
        <strong>Eles não serão mostrados de novo.</strong>
      </p>
      <ul className="recovery-codes mono">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <button type="button" className="link-button" onClick={copy}>
        {copied ? 'Copiado!' : 'Copiar códigos'}
      </button>
      <label className="checkbox">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        Guardei os códigos num lugar seguro
      </label>
      <button type="button" className="button" disabled={!saved} onClick={onDone}>
        Continuar
      </button>
    </div>
  )
}
