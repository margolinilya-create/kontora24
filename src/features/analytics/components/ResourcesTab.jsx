export function ResourcesTab({ matData }) {
  if (matData.length > 0) {
    return (
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="font-semibold mb-4">Расход материалов</h2>
        <div className="space-y-3">
          {matData.map((m) => (
            <div key={m.name} className="flex items-center justify-between text-sm">
              <span className="font-medium">{m.name}</span>
              <span className="text-text-muted">{m.total.toFixed(2)} {m.unit}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-12 text-center">
      <p className="text-text-muted">Нет данных о расходе материалов за выбранный период</p>
    </div>
  )
}
