import { Info } from 'lucide-react'
import { STORE } from '../config/store'

// Faixa no topo enquanto a loja for só portfólio: ninguém confunde com uma loja real.
export function DemoNotice() {
  if (!STORE.demo) return null
  return (
    <div className="demo-notice" role="note">
      <Info size={14} aria-hidden="true" /> Loja demonstrativa (projeto de portfólio): nenhuma compra é cobrada ou
      entregue. Pagamentos em modo de teste.
    </div>
  )
}
