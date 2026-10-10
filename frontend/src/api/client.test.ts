import { describe, expect, it, vi } from 'vitest'
import { mockFetch } from '../test/fetch-mock'
import { api, ApiError, setUnauthorizedHandler } from './client'

describe('cliente da API', () => {
  it('envia cookies (credentials: include) e JSON', async () => {
    const fetchMock = mockFetch({ 'POST /orders': { status: 201, body: { id: '1' } } })
    await api('/orders', { method: 'POST', body: { items: [] } })

    const [, init] = fetchMock.mock.calls[0]
    expect(init?.credentials).toBe('include')
    const headers = (init?.headers ?? {}) as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
    expect(init?.headers).not.toHaveProperty('Authorization')
  })

  it('junta as mensagens de validação do Nest', async () => {
    mockFetch({
      'POST /auth/register': { status: 400, body: { message: ['email must be an email', 'password too short'] } },
    })
    await expect(api('/auth/register', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 400,
      message: 'email must be an email; password too short',
    })
  })

  it('traduz 429 em mensagem amigável', async () => {
    mockFetch({ 'POST /auth/login': { status: 429, body: { message: 'ThrottlerException' } } })
    await expect(api('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 429,
      message: 'Muitas tentativas. Aguarde um pouco e tente de novo.',
    })
  })

  it('repassa o código de erro (ex.: e-mail não confirmado)', async () => {
    mockFetch({ 'POST /auth/login': { status: 403, body: { code: 'EMAIL_NOT_VERIFIED', message: 'Confirme' } } })
    const error: unknown = await api('/auth/login', { method: 'POST', body: {} }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('EMAIL_NOT_VERIFIED')
  })

  it('avisa a sessão quando recebe 401, exceto em chamadas silenciosas', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    mockFetch({ 'GET /orders': { status: 401 }, 'GET /auth/me': { status: 401 } })

    await api('/auth/me', { silent401: true }).catch(() => undefined)
    expect(handler).not.toHaveBeenCalled()
    await api('/orders').catch(() => undefined)
    expect(handler).toHaveBeenCalledOnce()
    setUnauthorizedHandler(null)
  })

  it('mensagem clara quando o servidor está fora do ar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(api('/products')).rejects.toMatchObject({
      status: 0,
      message: 'Não foi possível conectar ao servidor',
    })
  })
})
