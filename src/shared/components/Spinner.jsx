export default function Spinner({ size = 'md', className = '' }) {
  const sizes = { xs: 'h-3 w-3 border', sm: 'h-5 w-5 border-2', md: 'h-8 w-8 border-2', lg: 'h-12 w-12 border-2' }

  return (
    <div
      role="status"
      aria-label="Загрузка"
      className={`animate-spin rounded-full border-accent border-t-transparent ${sizes[size]} ${className}`}
    />
  )
}
