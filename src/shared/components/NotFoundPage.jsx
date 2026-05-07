import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="text-6xl font-bold text-accent mb-2">404</div>
      <h1 className="text-xl font-semibold mb-2">Страница не найдена</h1>
      <p className="text-text-muted mb-6">Такой страницы не существует или она была удалена</p>
      <Link
        to="/"
        className="bg-accent hover:bg-accent-hover text-on-accent font-medium rounded-lg px-5 py-2.5 text-sm transition-colors"
      >
        На главную
      </Link>
    </div>
  )
}
