import { createContext, useContext } from 'react'
import { ApiError } from '../../api/client'

// Quando a sessão do painel (30 min) expira, o backend responde 403 com este código.
export const ADMIN_2FA_REQUIRED = 'ADMIN_2FA_REQUIRED'

export function isStepUpError(err: unknown): boolean {
  return err instanceof ApiError && err.code === ADMIN_2FA_REQUIRED
}

interface AdminSession {
  // Envolve chamadas do painel: se a sessão de admin expirou, volta para o pedido de código.
  guard: <T>(promise: Promise<T>) => Promise<T>
}

export const AdminSessionContext = createContext<AdminSession | null>(null)

export function useAdminSession() {
  const ctx = useContext(AdminSessionContext)
  if (!ctx) throw new Error('useAdminSession precisa estar dentro do painel')
  return ctx
}
