import { useState } from 'react'
import type { FormEvent } from 'react'
import { Truck } from 'lucide-react'
import { shippingApi } from '../api/endpoints'
import type { ShippingOption } from '../api/types'
import { formatCep, onlyDigits } from '../utils/format'
import { ShippingOptions } from './ShippingOptions'

// "Calcular frete" da página do produto: só mostra preço e prazo, não guarda nada.
export function ShippingCalculator({ productId, quantity }: { productId: string; quantity: number }) {
  const [cep, setCep] = useState('')
  const [options, setOptions] = useState<ShippingOption[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function calculate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      setOptions(await shippingApi.quote(onlyDigits(cep), [{ productId, quantity }]))
    } catch (err) {
      setOptions(null)
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="shipping-calc">
      <form onSubmit={calculate} className="shipping-calc-form">
        <label htmlFor="calc-cep" className="small">
          <Truck size={16} aria-hidden="true" /> Calcular frete e prazo
        </label>
        <div className="inline-field">
          <input
            id="calc-cep"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            value={cep}
            onChange={(e) => setCep(formatCep(e.target.value))}
          />
          <button type="submit" className="button button-ghost" disabled={loading || onlyDigits(cep).length !== 8}>
            {loading ? '...' : 'OK'}
          </button>
        </div>
        <a
          className="small muted"
          href="https://buscacepinter.correios.com.br/app/endereco/index.php"
          target="_blank"
          rel="noopener noreferrer"
        >
          Não sei meu CEP
        </a>
      </form>
      {error && <p className="alert alert-error">{error}</p>}
      {options && <ShippingOptions options={options} />}
    </div>
  )
}
