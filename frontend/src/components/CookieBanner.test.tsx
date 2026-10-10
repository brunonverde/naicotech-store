import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { CONSENT_KEY, ConsentProvider, useConsent } from '../context/ConsentContext'
import { CookieBanner } from './CookieBanner'

function ReopenButton() {
  const { openPreferences } = useConsent()
  return (
    <button type="button" onClick={openPreferences}>
      Preferências de cookies
    </button>
  )
}

const renderBanner = () =>
  render(
    <MemoryRouter>
      <ConsentProvider>
        <CookieBanner />
        <ReopenButton />
      </ConsentProvider>
    </MemoryRouter>,
  )

const saved = () => JSON.parse(localStorage.getItem(CONSENT_KEY) ?? 'null')

describe('aviso de cookies', () => {
  it('aparece na primeira visita e "Só essenciais" recusa o opcional', async () => {
    renderBanner()
    await userEvent.click(screen.getByRole('button', { name: 'Só essenciais' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(saved()).toMatchObject({ version: 1, cart: false })
  })

  it('personalizar e reabrir pelo rodapé mostra a escolha salva', async () => {
    renderBanner()
    await userEvent.click(screen.getByRole('button', { name: 'Personalizar' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Lembrar meu carrinho/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar escolhas' }))
    expect(saved()).toMatchObject({ cart: true })

    await userEvent.click(screen.getByRole('button', { name: 'Preferências de cookies' }))
    expect(screen.getByRole('checkbox', { name: /Lembrar meu carrinho/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Essenciais/ })).toBeDisabled()
  })

  it('não aparece de novo depois de decidir', () => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ version: 1, decidedAt: '', cart: true }))
    renderBanner()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
