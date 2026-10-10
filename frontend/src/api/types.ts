// Decimals do Prisma chegam no JSON como string (ex.: "1299.90").
export type Decimal = string

export type Role = 'ADMIN' | 'CUSTOMER'
export type Condition = 'NEW' | 'USED'
export type OrderStatus = 'PENDING' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'

export interface Category {
  id: string
  name: string
  slug: string
}

export interface Product {
  id: string
  name: string
  description: string
  price: Decimal
  condition: Condition
  stock: number
  images: string[]
  categoryId: string
  category: Category
  createdAt: string
  updatedAt: string
}

export interface Review {
  id: string
  rating: number
  comment: string | null
  createdAt: string
  user: { name: string }
}

export interface OrderItem {
  id: string
  orderId: string
  productId: string
  quantity: number
  unitPrice: Decimal
}

export interface Order {
  id: string
  userId: string
  status: OrderStatus
  totalAmount: Decimal
  paymentId: string | null
  items: OrderItem[]
  shippingPrice: Decimal
  shippingServiceId: number | null
  shippingServiceName: string | null
  shippingCompany: string | null
  shippingDeliveryDays: number | null
  // Só cidade/UF e CEP parcial: o endereço completo nunca vem para o navegador.
  shippingSummary: string | null
  shipmentStatus: string | null
  trackingCode: string | null
  shippedAt: string | null
  deliveredAt: string | null
  createdAt: string
  updatedAt: string
}

// ---------- Frete e endereços ----------
export interface ShippingOption {
  serviceId: number
  name: string
  company: string
  companyId: number
  picture: string | null
  price: Decimal
  deliveryDays: number | null
}

export interface AddressInput {
  recipientName: string
  document: string
  phone: string
  postalCode: string
  street: string
  number: string
  complement: string
  district: string
  city: string
  state: string
}

// Endereço salvo, sempre mascarado pela API.
export interface SavedAddress {
  id: string
  recipient: string
  line: string
  city: string
  postalCode: string
  createdAt: string
}

export interface CepLookup {
  postalCode: string
  street: string
  district: string
  city: string
  state: string
}

export interface CreateOrderInput {
  items: { productId: string; quantity: number }[]
  shippingServiceId: number
  addressId?: string
  address?: AddressInput
  saveAddress?: boolean
}

export type CardType = 'credit_card' | 'debit_card'

export interface PayOrderInput {
  cardToken: string
  paymentMethodId: string
  paymentType: CardType
  installments: number
}

export interface SessionUser {
  sub: string
  name: string
  email: string
  role: Role
}

// ---------- Painel de admin ----------
export interface PackageDimensions {
  weightGrams: number
  lengthCm: number
  widthCm: number
  heightCm: number
}

export interface AdminProduct extends Omit<Product, 'category'>, PackageDimensions {
  costPrice: Decimal | null
  category: { id: string; name: string }
}

export interface AdminOrder extends Omit<Order, 'items'> {
  user: { name: string; email: string }
  items: (OrderItem & { product: { name: string } })[]
}

export interface AuditEntry {
  id: string
  action: string
  target: string | null
  details: Record<string, unknown> | null
  ip: string | null
  createdAt: string
  user: { name: string; email: string }
}

export interface TwoFactorStatus {
  enabled: boolean
  lockedUntil: string | null
  recoveryCodesLeft: number
}

export interface ProductInput extends PackageDimensions {
  name: string
  description: string
  price: number
  costPrice?: number
  condition: Condition
  stock: number
  categoryId: string
  images: string[]
}

// Endereço completo de um pedido (só no painel de admin, sob demanda).
export type ShippingAddressFull = AddressInput
