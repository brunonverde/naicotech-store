import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronLeft, ChevronRight, CircuitBoard, Gamepad2, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Slide {
  eyebrow: string
  title: string
  highlight: string
  text: string
  cta: string
  to: string
  Icon: LucideIcon
  variant: string
}

const SLIDES: Slide[] = [
  {
    eyebrow: 'Setup gamer',
    title: 'Monte o setup',
    highlight: 'dos seus sonhos',
    text: 'Placas de vídeo, processadores e periféricos para jogar tudo no máximo.',
    cta: 'Ver produtos',
    to: '/#catalogo',
    Icon: Gamepad2,
    variant: 'aqua',
  },
  {
    eyebrow: 'Placas de vídeo',
    title: 'Mais FPS,',
    highlight: 'menos espera',
    text: 'Ray tracing e DLSS para rodar os lançamentos com qualidade lá em cima.',
    cta: 'Ver placas de vídeo',
    to: '/?categoria=placas-de-video#catalogo',
    Icon: CircuitBoard,
    variant: 'blue',
  },
  {
    eyebrow: 'Compra protegida',
    title: 'Pague com',
    highlight: 'segurança',
    text: 'Cartão de crédito ou débito pelo Mercado Pago, em até 12x. Os dados do cartão nunca passam pela loja.',
    cta: 'Comprar agora',
    to: '/#catalogo',
    Icon: ShieldCheck,
    variant: 'mix',
  },
]

const INTERVAL_MS = 6000

export function HeroCarousel() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  const go = useCallback((next: number) => {
    setIndex((next + SLIDES.length) % SLIDES.length)
  }, [])

  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (paused || reduceMotion) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), INTERVAL_MS)
    return () => clearInterval(timer)
  }, [paused])

  return (
    <section
      className="hero"
      aria-roledescription="carrossel"
      aria-label="Destaques"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {SLIDES.map((s, i) => (
        <div
          key={s.title}
          className={`hero-slide hero-${s.variant} ${i === index ? 'active' : ''}`}
          aria-hidden={i !== index}
          role="group"
          aria-roledescription="slide"
          aria-label={`${i + 1} de ${SLIDES.length}`}
        >
          <div className="hero-grid" aria-hidden="true" />
          <div className="hero-content">
            <span className="eyebrow">{s.eyebrow}</span>
            <h1>
              {s.title} <span className="gradient-text">{s.highlight}</span>
            </h1>
            <p>{s.text}</p>
            <Link to={s.to} className="button button-lg" tabIndex={i === index ? 0 : -1}>
              {s.cta} <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="hero-ring" />
            <div className="hero-ring hero-ring-2" />
            <s.Icon size={120} strokeWidth={1.2} className="hero-icon" />
          </div>
        </div>
      ))}

      <button type="button" className="hero-nav hero-prev" onClick={() => go(index - 1)} aria-label="Destaque anterior">
        <ChevronLeft size={22} />
      </button>
      <button type="button" className="hero-nav hero-next" onClick={() => go(index + 1)} aria-label="Próximo destaque">
        <ChevronRight size={22} />
      </button>
      <div className="hero-dots">
        {SLIDES.map((s, i) => (
          <button
            key={s.title}
            type="button"
            className={i === index ? 'active' : ''}
            onClick={() => go(i)}
            aria-label={`Ir para o destaque ${i + 1}`}
            aria-current={i === index}
          />
        ))}
      </div>
    </section>
  )
}
