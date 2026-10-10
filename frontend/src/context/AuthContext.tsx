import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { setUnauthorizedHandler } from '../api/client'
import { authApi } from '../api/endpoints'
import type { SessionUser } from '../api/types'

interface AuthContextValue {
  user: SessionUser | null
  // true enquanto confirma com o backend se o cookie de sessão ainda vale.
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  // Usado quando o backend já abriu a sessão (ex.: confirmação de e-mail).
  startSession: (user: SessionUser) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Versões antigas guardavam o token no localStorage; não usamos mais.
    try {
      localStorage.removeItem('naicotech.token')
    } catch {
      // ignore
    }
    let active = true
    authApi
      .me()
      .then((me) => active && setUser(me))
      .catch(() => active && setUser(null))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const startSession = useCallback((sessionUser: SessionUser) => setUser(sessionUser), [])

  const login = useCallback(async (email: string, password: string) => {
    const { user: sessionUser } = await authApi.login(email, password)
    setUser(sessionUser)
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    return () => setUnauthorizedHandler(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, startSession, logout }),
    [user, loading, login, startSession, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
