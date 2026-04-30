import { DEFAULTS } from '@/features/calculator/lib/calculator'
import { ROLES } from '@/shared/constants'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Настройки</h1>
        <p className="text-text-muted">Управление параметрами производства</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Параметры калькулятора</h2>
          <div className="space-y-3 text-sm">
            {Object.entries(DEFAULTS).map(([key, val]) => (
              <div key={key} className="flex justify-between items-center">
                <span className="text-text-muted">{key}</span>
                <input
                  type="number"
                  defaultValue={val}
                  className="w-28 rounded-lg border border-border px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-accent/50"
                  disabled
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-text-muted mt-4">
            Редактирование будет доступно после подключения таблицы settings в Supabase.
          </p>
        </div>

        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Пользователи</h2>
          <p className="text-text-muted text-sm">Управление пользователями будет здесь.</p>
        </div>
      </div>
    </div>
  )
}
