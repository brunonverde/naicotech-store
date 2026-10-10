import { memo } from 'react'
import { CardPayment, initMercadoPago } from '@mercadopago/sdk-react'
import { ordersApi } from '../api/endpoints'
import type { CardType, Order } from '../api/types'

const publicKey = import.meta.env.VITE_MP_PUBLIC_KEY

// Nonce da CSP desta página (gerado pelo server.mjs a cada resposta). O SDK do
// Mercado Pago usa para rodar o script de antifraude sem liberar scripts inline em geral.
function cspNonce(): string | undefined {
  const value = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content
  return value && value !== '__CSP_NONCE__' ? value : undefined
}

if (publicKey) {
  const nonce = cspNonce()
  // deviceProfileCspNonce é aceito pelo SDK JS, mas ainda não está nos tipos do SDK React.
  const options = { locale: 'pt-BR', ...(nonce ? { deviceProfileCspNonce: nonce } : {}) } as const
  initMercadoPago(publicKey, options as Parameters<typeof initMercadoPago>[1])
}

interface Props {
  order: Order
  email: string
  onPaid: (order: Order) => void
  onError: (message: string) => void
}

// memo: o Brick é um iframe do Mercado Pago; re-renderizar à toa recria o formulário.
export const CardPaymentForm = memo(function CardPaymentForm({
  order,
  email,
  onPaid,
  onError,
}: Props) {
  if (!publicKey) {
    return (
      <p className="alert alert-error">
        VITE_MP_PUBLIC_KEY não configurada em frontend/.env (reinicie o npm run dev depois).
      </p>
    )
  }

  return (
    <CardPayment
      locale="pt-BR"
      initialization={{ amount: Number(order.totalAmount), payer: { email } }}
      customization={{
        paymentMethods: {
          maxInstallments: 12,
          types: { included: ['credit_card', 'debit_card'] },
        },
        // Tema escuro com as cores da loja.
        visual: {
          style: {
            theme: 'dark',
            customVariables: {
              baseColor: '#2dd4bf',
              baseColorFirstVariant: '#38bdf8',
              baseColorSecondVariant: '#14b8a6',
              formBackgroundColor: '#161b22',
              inputBackgroundColor: '#0e1116',
              borderRadiusMedium: '10px',
            },
          },
        },
      }}
      onSubmit={async (formData, additionalData) => {
        // Os dados do cartão ficam no Mercado Pago; aqui só trafega o token.
        const paymentType: CardType =
          additionalData?.paymentTypeId === 'debit_card' ? 'debit_card' : 'credit_card'
        try {
          const updated = await ordersApi.pay(order.id, {
            cardToken: formData.token,
            paymentMethodId: formData.payment_method_id,
            paymentType,
            installments: formData.installments,
          })
          onPaid(updated)
        } catch (err) {
          onError((err as Error).message)
          // Rejeitar devolve o Brick ao estado de edição para tentar de novo.
          throw err
        }
      }}
      onError={(error) => {
        console.error('Erro no Brick do Mercado Pago', error)
        if (error.type === 'critical') onError('Não foi possível carregar o formulário de pagamento')
      }}
    />
  )
})
