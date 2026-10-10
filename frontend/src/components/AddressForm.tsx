import { useState } from 'react'
import { shippingApi } from '../api/endpoints'
import type { AddressInput } from '../api/types'
import { formatCep, formatCpf, formatPhone, onlyDigits } from '../utils/format'

const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ')

interface Props {
  value: AddressInput
  onChange: (value: AddressInput) => void
}

export function AddressForm({ value, onChange }: Props) {
  const [cepStatus, setCepStatus] = useState<string | null>(null)

  const set = (field: keyof AddressInput, format?: (v: string) => string) => (e: { target: { value: string } }) =>
    onChange({ ...value, [field]: format ? format(e.target.value) : e.target.value })

  async function changeCep(raw: string) {
    const postalCode = formatCep(raw)
    const next = { ...value, postalCode }
    onChange(next)
    if (onlyDigits(postalCode).length !== 8) return
    setCepStatus('Buscando endereço...')
    try {
      const found = await shippingApi.cep(onlyDigits(postalCode))
      onChange({
        ...next,
        street: found.street || next.street,
        district: found.district || next.district,
        city: found.city || next.city,
        state: found.state || next.state,
      })
      setCepStatus(null)
    } catch (err) {
      setCepStatus((err as Error).message)
    }
  }

  return (
    <div className="form address-form">
      <div className="form-row">
        <label>
          CEP
          <input
            required
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            value={value.postalCode}
            onChange={(e) => void changeCep(e.target.value)}
          />
          {cepStatus && <small className="muted">{cepStatus}</small>}
        </label>
        <label>
          Nome de quem recebe
          <input required minLength={3} maxLength={100} autoComplete="name" value={value.recipientName} onChange={set('recipientName')} />
        </label>
      </div>
      <div className="form-row">
        <label>
          Rua / Avenida
          <input required maxLength={120} autoComplete="address-line1" value={value.street} onChange={set('street')} />
        </label>
        <label className="field-sm">
          Número
          <input required maxLength={10} value={value.number} onChange={set('number')} />
        </label>
      </div>
      <div className="form-row">
        <label>
          Complemento <small className="muted">(opcional)</small>
          <input maxLength={60} autoComplete="address-line2" value={value.complement} onChange={set('complement')} />
        </label>
        <label>
          Bairro
          <input required maxLength={60} value={value.district} onChange={set('district')} />
        </label>
      </div>
      <div className="form-row">
        <label>
          Cidade
          <input required maxLength={60} autoComplete="address-level2" value={value.city} onChange={set('city')} />
        </label>
        <label className="field-sm">
          UF
          <select required value={value.state} onChange={set('state')} autoComplete="address-level1">
            <option value="" disabled>
              --
            </option>
            {UFS.map((uf) => (
              <option key={uf}>{uf}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>
          CPF <small className="muted">(exigido pela transportadora)</small>
          <input
            required
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={value.document}
            onChange={set('document', formatCpf)}
          />
        </label>
        <label>
          Celular
          <input
            required
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(00) 00000-0000"
            value={value.phone}
            onChange={set('phone', formatPhone)}
          />
        </label>
      </div>
    </div>
  )
}
