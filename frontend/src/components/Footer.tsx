import { Link } from 'react-router-dom'
import { Cpu, CreditCard, Lock, ShieldCheck } from 'lucide-react'
import { STORE } from '../config/store'

const YEAR = new Date().getFullYear()

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <Link to="/" className="logo">
            <span className="logo-mark">
              <Cpu size={20} aria-hidden="true" />
            </span>
            <span className="logo-text">
              Naico<span>Tech</span>
            </span>
          </Link>
          <p className="muted">Hardware e periféricos para montar, turbinar e jogar.</p>
        </div>
        <div>
          <h3>Loja</h3>
          <ul>
            <li>
              <Link to="/#catalogo">Todos os produtos</Link>
            </li>
            <li>
              <Link to="/carrinho">Carrinho</Link>
            </li>
            <li>
              <Link to="/pedidos">Meus pedidos</Link>
            </li>
          </ul>
        </div>
        <div>
          <h3>Conta</h3>
          <ul>
            <li>
              <Link to="/login">Entrar</Link>
            </li>
            <li>
              <Link to="/cadastro">Criar conta</Link>
            </li>
            <li>
              <Link to="/esqueci-senha">Esqueci minha senha</Link>
            </li>
            <li>
              <Link to="/conta">Minha conta e meus dados</Link>
            </li>
          </ul>
        </div>
        <div>
          <h3>Institucional</h3>
          <ul>
            <li>
              <Link to="/privacidade">Política de Privacidade</Link>
            </li>
            <li>
              <Link to="/termos">Termos de Uso</Link>
            </li>
            <li>
              <Link to="/trocas">Trocas e devoluções</Link>
            </li>
          </ul>
        </div>
        <div>
          <h3>Segurança</h3>
          <ul className="footer-trust">
            <li>
              <ShieldCheck size={16} aria-hidden="true" /> Pagamento pelo Mercado Pago
            </li>
            <li>
              <Lock size={16} aria-hidden="true" /> Dados do cartão não passam pela loja
            </li>
            <li>
              <CreditCard size={16} aria-hidden="true" /> Crédito e débito
            </li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom">
        <div className="container footer-legal">
          <span>© {YEAR} NaicoTech Store. Todos os direitos reservados.</span>
          <span>
            {STORE.legalName ?? (STORE.demo ? 'Loja demonstrativa: projeto de portfólio' : STORE.name)}
            {STORE.document && ` · CNPJ/CPF ${STORE.document}`}
            {STORE.address && ` · ${STORE.address}`}
          </span>
        </div>
      </div>
    </footer>
  )
}
