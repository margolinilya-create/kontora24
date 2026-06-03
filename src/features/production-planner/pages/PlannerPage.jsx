// R12.0 — stub страницы планировщика. Реальный UI приедет в R12.3+.
// Заглушка нужна чтобы прокинуть права, маршрут и шильдик БЕТА в прод
// и убедиться что ничего из существующих страниц не сломалось.

export default function PlannerPage() {
  return (
    <div className="px-4 md:px-6 py-4 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl md:text-2xl font-bold uppercase tracking-tight">
          Планирование производства
        </h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800 border border-amber-300">
          бета
        </span>
      </div>
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          Раздел в активной разработке. В нём появится: список активных
          заказов с прогрессом, календарь загрузки отделов на 30 рабочих
          дней, автоматический расчёт длительности этапов по нормативам и
          ручная корректировка плана через drag-and-drop.
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-3">
          Доступ открыт только админу и менеджеру. Существующие очереди и
          канбан продолжают работать как раньше.
        </p>
      </div>
    </div>
  )
}
