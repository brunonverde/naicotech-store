import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

// Consentimento de cookies e armazenamento (LGPD). Só o que é opcional depende
// dele; o essencial (sessão, segurança e antifraude do pagamento) não.
// Se a política mudar de forma relevante, suba a versão: todos são perguntados de novo.
export const CONSENT_VERSION = 1
export const CONSENT_KEY = 'naicotech.consent'

export interface Consent {
  version: number
  decidedAt: string
  // Lembrar o carrinho neste navegador entre visitas.
  cart: boolean
}

interface ConsentContextValue {
  consent: Consent | null
  decide: (choice: { cart: boolean }) => void
  preferencesOpen: boolean
  openPreferences: () => void
  closePreferences: () => void
}

const ConsentContext = createContext<ConsentContextValue | null>(null)

// oxlint-disable-next-line react/only-export-components
export function readConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY)
    const parsed = raw ? (JSON.parse(raw) as Consent) : null
    return parsed?.version === CONSENT_VERSION ? parsed : null
  } catch {
    return null
  }
}

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<Consent | null>(readConsent)
  const [preferencesOpen, setPreferencesOpen] = useState(false)

  const decide = useCallback((choice: { cart: boolean }) => {
    const next: Consent = { version: CONSENT_VERSION, decidedAt: new Date().toISOString(), cart: choice.cart }
    try {
      // Guardar a própria escolha é essencial: sem isso o aviso apareceria em toda página.
      localStorage.setItem(CONSENT_KEY, JSON.stringify(next))
    } catch {
      // Navegador sem armazenamento: a escolha vale só nesta aba.
    }
    setConsent(next)
    setPreferencesOpen(false)
  }, [])

  const openPreferences = useCallback(() => setPreferencesOpen(true), [])
  const closePreferences = useCallback(() => setPreferencesOpen(false), [])

  const value = useMemo(
    () => ({ consent, decide, preferencesOpen, openPreferences, closePreferences }),
    [consent, decide, preferencesOpen, openPreferences, closePreferences],
  )
  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useConsent() {
  const ctx = useContext(ConsentContext)
  if (!ctx) throw new Error('useConsent precisa estar dentro de <ConsentProvider>')
  return ctx
}
