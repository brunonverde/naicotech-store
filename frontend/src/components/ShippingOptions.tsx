import { Truck } from 'lucide-react'
import type { ShippingOption } from '../api/types'
import { deliveryLabel, formatPrice } from '../utils/format'

interface Props {
  options: ShippingOption[]
  // Sem onSelect: só mostra os preços (página do produto).
  selected?: number | null
  onSelect?: (option: ShippingOption) => void
}

export function ShippingOptions({ options, selected, onSelect }: Props) {
  if (!options.length) {
    return <p className="muted small">Nenhuma transportadora atende esse CEP no momento.</p>
  }
  return (
    <ul className="shipping-options" role={onSelect ? 'radiogroup' : undefined} aria-label="Opções de frete">
      {options.map((o) => {
        const content = (
          <>
            {o.picture ? (
              <img src={o.picture} alt="" className="shipping-logo" loading="lazy" referrerPolicy="no-referrer" />
            ) : (
              <Truck size={20} aria-hidden="true" className="shipping-logo" />
            )}
            <span className="shipping-name">
              <strong>
                {o.company} {o.name}
              </strong>
              <span className="muted small">{deliveryLabel(o.deliveryDays)}</span>
            </span>
            <strong className="shipping-price">{formatPrice(o.price)}</strong>
          </>
        )
        return (
          <li key={o.serviceId}>
            {onSelect ? (
              <label className={`shipping-option ${selected === o.serviceId ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="shipping"
                  checked={selected === o.serviceId}
                  onChange={() => onSelect(o)}
                />
                {content}
              </label>
            ) : (
              <div className="shipping-option">{content}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
