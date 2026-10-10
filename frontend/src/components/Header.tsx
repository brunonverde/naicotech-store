import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom'
import {
  CreditCard,
  Cpu,
  LayoutGrid,
  LogOut,
  Package,
  Search,
  Shield,
  ShieldCheck,
  ShoppingCart,
  User,
  Zap,
} from 'lucide-react'
import { catalogApi } from '../api/endpoints'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { categoryIcon } from '../utils/categoryIcon'
import { formatPrice } from '../utils/format'
import { useAsync } from '../utils/useAsync'

export function Header() {
  const { user, logout } = useAuth()
  const { count, total } = useCart()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const categories = useAsync(catalogApi.categories, [])
  const urlQuery = params.get('q') ?? ''
  const [search, setSearch] = useState(urlQuery)

  // Mantém a busca do topo sincronizada com a URL (ex.: ao limpar os filtros).
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setSearch(urlQuery)
  }, [urlQuery])

  function submit(e: FormEvent) {
    e.preventDefault()
    const q = search.trim()
    navigate(q ? `/?q=${encodeURIComponent(q)}#catalogo` : '/#catalogo')
  }

  return (
    <header className="site-header">
      <div className="topbar">
        <div className="container topbar-inner">
          <span>
            <ShieldCheck size={15} aria-hidden="true" /> Compra segura com Mercado Pago
          </span>
          <span>
            <CreditCard size={15} aria-hidden="true" /> Parcele em até 12x no cartão
          </span>
          <span className="hide-sm">
            <Zap size={15} aria-hidden="true" /> Hardware para quem joga sério
          </span>
        </div>
      </div>

      <div className="mainbar">
        <div className="container mainbar-inner">
          <Link to="/" className="logo" aria-label="NaicoTech, página inicial">
            <span className="logo-mark">
              <Cpu size={22} aria-hidden="true" />
            </span>
            <span className="logo-text">
              Naico<span>Tech</span>
            </span>
          </Link>

          <form className="search" role="search" onSubmit={submit}>
            <input
              type="search"
              placeholder="Busque placa de vídeo, processador, periférico..."
              aria-label="Buscar produtos"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit" aria-label="Buscar">
              <Search size={20} />
            </button>
          </form>

          <nav className="header-actions" aria-label="Conta e carrinho">
            {user ? (
              <div className="account">
                <User size={22} aria-hidden="true" className="account-icon" />
                <div className="account-text">
                  <span className="muted small">Olá, {user.name.split(' ')[0]}</span>
                  <div className="account-links">
                    <NavLink to="/pedidos">
                      <Package size={14} aria-hidden="true" /> Pedidos
                    </NavLink>
                    {user.role === 'ADMIN' && (
                      <NavLink to="/admin">
                        <Shield size={14} aria-hidden="true" /> Admin
                      </NavLink>
                    )}
                    <button
                      type="button"
                      className="link-button"
                      onClick={async () => {
                        await logout()
                        navigate('/')
                      }}
                    >
                      <LogOut size={14} aria-hidden="true" /> Sair
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <Link to="/login" className="account">
                <User size={22} aria-hidden="true" className="account-icon" />
                <span className="account-text">
                  <span className="muted small">Bem-vindo!</span>
                  <strong>Entre ou cadastre-se</strong>
                </span>
              </Link>
            )}

            <Link to="/carrinho" className="cart-button" aria-label={`Carrinho com ${count} itens`}>
              <span className="cart-icon">
                <ShoppingCart size={24} aria-hidden="true" />
                {/* key muda a cada item: reinicia a animação de "pulo" */}
                {count > 0 && (
                  <span key={count} className="badge">
                    {count}
                  </span>
                )}
              </span>
              <span className="cart-total hide-sm">{count > 0 ? formatPrice(total) : 'Carrinho'}</span>
            </Link>
          </nav>
        </div>
      </div>

      <nav className="catbar" aria-label="Categorias">
        <div className="container catbar-inner">
          <Link to="/#catalogo" className="catbar-link">
            <LayoutGrid size={16} aria-hidden="true" /> Todos os produtos
          </Link>
          {categories.data?.map((c) => {
            const Icon = categoryIcon(c.slug)
            return (
              <Link key={c.id} to={`/?categoria=${c.slug}#catalogo`} className="catbar-link">
                <Icon size={16} aria-hidden="true" /> {c.name}
              </Link>
            )
          })}
        </div>
      </nav>
    </header>
  )
}
