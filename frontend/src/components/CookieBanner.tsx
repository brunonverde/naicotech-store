import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Cookie, X } from 'lucide-react'
import { useConsent } from '../context/ConsentContext'

// Aviso de cookies: aparece na primeira visita e pelo link "Preferências de cookies" do rodapé.
export function CookieBanner() {
  const { consent, preferencesOpen } = useConsent()
  if (consent && !preferencesOpen) return null
  // key: ao reabrir, o painel começa com a escolha salva.
  return <CookiePanel key={consent?.decidedAt ?? 'novo'} />
}

function CookiePanel() {
  const { consent, decide, preferencesOpen, closePreferences } = useConsent()
  const [customizing, setCustomizing] = useState(false)
  const [cart, setCart] = useState(consent?.cart ?? false)
  const showOptions = customizing || preferencesOpen

  return (
    <section className="cookie-banner card" role="dialog" aria-labelledby="cookie-title" aria-live="polite">
      <div className="cookie-head">
        <h2 id="cookie-title">
          <Cookie size={18} aria-hidden="true" /> Cookies e privacidade
        </h2>
        {preferencesOpen && consent && (
          <button type="button" className="link-button" onClick={closePreferences} aria-label="Fechar">
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="small">
        Usamos apenas o necessário para a loja funcionar com segurança. Não usamos cookies de publicidade nem de
        rastreamento. Saiba mais na <Link to="/privacidade">Política de Privacidade</Link>.
      </p>

      {showOptions && (
        <ul className="cookie-options">
          <li>
            <label className="checkbox">
              <input type="checkbox" checked disabled />
              <span>
                <strong>Essenciais</strong> (sempre ativos)
                <small className="muted">
                  Login, proteção contra ataques e, só na hora de pagar, o antifraude do Mercado Pago.
                </small>
              </span>
            </label>
          </li>
          <li>
            <label className="checkbox">
              <input type="checkbox" checked={cart} onChange={(e) => setCart(e.target.checked)} />
              <span>
                <strong>Lembrar meu carrinho</strong> (opcional)
                <small className="muted">Guarda os itens neste navegador para quando você voltar.</small>
              </span>
            </label>
          </li>
        </ul>
      )}

      <div className="cookie-actions">
        {showOptions ? (
          <button type="button" className="button" onClick={() => decide({ cart })}>
            Salvar escolhas
          </button>
        ) : (
          <>
            <button type="button" className="button" onClick={() => decide({ cart: true })}>
              Aceitar todos
            </button>
            <button type="button" className="button button-ghost" onClick={() => decide({ cart: false })}>
              Só essenciais
            </button>
            <button type="button" className="link-button" onClick={() => setCustomizing(true)}>
              Personalizar
            </button>
          </>
        )}
      </div>
    </section>
  )
}
