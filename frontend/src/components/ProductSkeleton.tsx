// Cartões "fantasma" com brilho animado enquanto os produtos carregam.
export function ProductSkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="product-card skeleton-card">
          <div className="skeleton skeleton-media" />
          <div className="product-card-body">
            <div className="skeleton skeleton-line short" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-price" />
          </div>
          <div className="product-card-footer">
            <div className="skeleton skeleton-button" />
          </div>
        </div>
      ))}
    </div>
  )
}
