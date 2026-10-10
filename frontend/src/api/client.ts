const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

// Chamado quando a API responde 401, para o AuthContext limpar a sessão da tela.
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

// A sessão vive num cookie httpOnly que o JavaScript não lê nem precisa ler:
// o navegador envia sozinho (credentials: 'include').
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; silent401?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'include',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Não foi possível conectar ao servidor')
  }

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401 && !options.silent401) onUnauthorized?.()
    if (response.status === 429) {
      throw new ApiError(429, 'Muitas tentativas. Aguarde um pouco e tente de novo.')
    }
    // O ValidationPipe do Nest devolve message como string ou string[].
    const raw = data?.message
    const message = Array.isArray(raw) ? raw.join('; ') : (raw ?? 'Erro inesperado')
    throw new ApiError(response.status, message, data?.code)
  }
  return data as T
}
