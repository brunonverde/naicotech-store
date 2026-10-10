import { useState } from 'react'
import { Box } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Props {
  src?: string | null
  alt: string
  // Ícone mostrado quando não há imagem (ex.: o da categoria).
  FallbackIcon?: LucideIcon
  className?: string
}

export function ProductImage({ src, alt, FallbackIcon = Box, className = '' }: Props) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div className={`product-image placeholder ${className}`} role="img" aria-label={alt}>
        <FallbackIcon size={48} strokeWidth={1.2} aria-hidden="true" />
      </div>
    )
  }
  return (
    <img
      className={`product-image ${className}`}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}
