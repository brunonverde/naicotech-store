import { api } from './client'
import type {
  AdminOrder,
  AdminProduct,
  AddressInput,
  AuditEntry,
  Category,
  CepLookup,
  CreateOrderInput,
  Order,
  PayOrderInput,
  Product,
  ProductInput,
  Review,
  SavedAddress,
  SessionUser,
  ShippingAddressFull,
  ShippingOption,
  TwoFactorStatus,
} from './types'

export const authApi = {
  me: () => api<SessionUser>('/auth/me', { silent401: true }),
  login: (email: string, password: string) =>
    api<{ user: SessionUser }>('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => api<{ ok: boolean }>('/auth/logout', { method: 'POST', silent401: true }),
  register: (name: string, email: string, password: string, acceptTerms: boolean) =>
    api<{ message: string }>('/auth/register', {
      method: 'POST',
      body: { name, email, password, acceptTerms },
    }),
  verifyEmail: (token: string) =>
    api<{ user: SessionUser }>('/auth/verify-email', { method: 'POST', body: { token } }),
  forgotPassword: (email: string) =>
    api<{ message: string }>('/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (token: string, password: string) =>
    api<{ user: SessionUser }>('/auth/reset-password', {
      method: 'POST',
      body: { token, password },
    }),
  resendVerification: (email: string) =>
    api<{ message: string }>('/auth/resend-verification', {
      method: 'POST',
      body: { email },
    }),
}

export const catalogApi = {
  products: () => api<Product[]>('/products'),
  product: (id: string) => api<Product>(`/products/${id}`),
  categories: () => api<Category[]>('/categories'),
  reviews: (productId: string) => api<Review[]>(`/reviews/product/${productId}`),
}

type CartLines = { productId: string; quantity: number }[]

export const shippingApi = {
  quote: (postalCode: string, items: CartLines) =>
    api<ShippingOption[]>('/shipping/quote', { method: 'POST', body: { postalCode, items } }),
  quoteForAddress: (addressId: string, items: CartLines) =>
    api<ShippingOption[]>('/shipping/quote/address', { method: 'POST', body: { addressId, items } }),
  cep: (cep: string) => api<CepLookup>(`/shipping/cep/${cep}`),
}

export const addressesApi = {
  list: () => api<SavedAddress[]>('/addresses'),
  create: (input: AddressInput) => api<SavedAddress>('/addresses', { method: 'POST', body: input }),
  remove: (id: string) => api<{ deleted: true }>(`/addresses/${id}`, { method: 'DELETE' }),
}

// Direitos do titular (LGPD): sempre com a senha de novo.
export const accountApi = {
  exportData: (password: string) =>
    api<Record<string, unknown>>('/account/export', { method: 'POST', body: { password } }),
  deleteAccount: (password: string, confirm: string) =>
    api<{ deleted: true }>('/account/delete', { method: 'POST', body: { password, confirm } }),
}

export const ordersApi = {
  create: (input: CreateOrderInput) => api<Order>('/orders', { method: 'POST', body: input }),
  mine: () => api<Order[]>('/orders'),
  one: (id: string) => api<Order>(`/orders/${id}`),
  pay: (id: string, input: PayOrderInput) =>
    api<Order>(`/orders/${id}/pay`, { method: 'POST', body: input }),
}

export const adminApi = {
  status: () => api<TwoFactorStatus>('/admin/2fa/status'),
  setup: (password: string) =>
    api<{ secret: string; otpauthUri: string }>('/admin/2fa/setup', { method: 'POST', body: { password } }),
  enable: (code: string) =>
    api<{ recoveryCodes: string[] }>('/admin/2fa/enable', { method: 'POST', body: { code } }),
  verify: (code: string) =>
    api<{ ok: true; recoveryCodesLeft?: number }>('/admin/2fa/verify', { method: 'POST', body: { code } }),
  end: () => api<{ ok: true }>('/admin/2fa/end', { method: 'POST' }),
  reset: (password: string) => api<{ ok: true }>('/admin/2fa/reset', { method: 'POST', body: { password } }),
  regenerateCodes: (password: string) =>
    api<{ recoveryCodes: string[] }>('/admin/2fa/recovery-codes', { method: 'POST', body: { password } }),

  products: () => api<AdminProduct[]>('/admin/products'),
  createProduct: (input: ProductInput) => api<AdminProduct>('/products', { method: 'POST', body: input }),
  updateProduct: (id: string, input: Partial<ProductInput>) =>
    api<AdminProduct>(`/products/${id}`, { method: 'PATCH', body: input }),
  deleteProduct: (id: string) => api<{ deleted: true }>(`/products/${id}`, { method: 'DELETE' }),

  createCategory: (name: string) => api<Category>('/categories', { method: 'POST', body: { name } }),
  deleteCategory: (id: string) => api<{ deleted: true }>(`/categories/${id}`, { method: 'DELETE' }),

  orders: (status?: string) => api<AdminOrder[]>(`/admin/orders${status ? `?status=${status}` : ''}`),
  updateOrderStatus: (id: string, status: 'SHIPPED' | 'DELIVERED') =>
    api<Order>(`/admin/orders/${id}/status`, { method: 'PATCH', body: { status } }),

  shippingSettings: () => api<{ commercial: boolean; insuranceCap: number | null }>('/admin/shipping/settings'),
  generateLabel: (id: string, invoiceKey?: string) =>
    api<Order>(`/admin/orders/${id}/label`, { method: 'POST', body: invoiceKey ? { invoiceKey } : {} }),
  printLabel: (id: string) => api<{ url: string }>(`/admin/orders/${id}/label/print`, { method: 'POST' }),
  orderAddress: (id: string) => api<ShippingAddressFull>(`/admin/orders/${id}/address`, { method: 'POST' }),
  syncShipments: () =>
    api<{ checked: number; shipped: number; delivered: number }>('/admin/shipments/sync', { method: 'POST' }),

  auditLog: () => api<AuditEntry[]>('/admin/audit-log'),
}
