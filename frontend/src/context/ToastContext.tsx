import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle2, X } from 'lucide-react'

interface Toast {
  id: number
  title: string
  description?: string
}

interface ToastContextValue {
  notify: (title: string, description?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)
const DURATION_MS = 3200

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const notify = useCallback(
    (title: string, description?: string) => {
      const id = ++nextId.current
      // Mantém no máximo 3 avisos na tela.
      setToasts((list) => [...list.slice(-2), { id, title, description }])
      setTimeout(() => dismiss(id), DURATION_MS)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ notify }), [notify])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <CheckCircle2 size={20} className="toast-icon" aria-hidden="true" />
            <div>
              <strong>{t.title}</strong>
              {t.description && <p>{t.description}</p>}
            </div>
            <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Fechar aviso">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// oxlint-disable-next-line react/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>')
  return ctx
}
