// Identificação da loja (Decreto 7.962/2013: nome, CPF/CNPJ, endereço e contato
// precisam estar visíveis). Enquanto a loja for só demonstração/portfólio,
// VITE_DEMO_MODE fica ligado e o site avisa que não há vendas reais.
const env = import.meta.env

export const STORE = {
  name: 'NaicoTech Store',
  demo: env.VITE_DEMO_MODE !== 'false',
  legalName: env.VITE_STORE_LEGAL_NAME || null,
  document: env.VITE_STORE_DOCUMENT || null,
  address: env.VITE_STORE_ADDRESS || null,
  contactEmail: env.VITE_STORE_CONTACT_EMAIL || null,
  updatedAt: '10/10/2026',
}
