import { Link } from 'react-router-dom'

export function Breadcrumbs({ items }) {
  if (!items || items.length === 0) return null

  return (
    <nav className="flex items-center gap-1.5 text-sm text-text-muted" aria-label="Breadcrumb">
      <Link to="/" className="hover:text-text transition-colors">Dashboard</Link>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span>/</span>
          {item.href ? (
            <Link to={item.href} className="hover:text-text transition-colors">{item.label}</Link>
          ) : (
            <span className="text-text font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
