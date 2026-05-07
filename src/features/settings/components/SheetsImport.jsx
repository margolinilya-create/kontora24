import { useState } from 'react'
import { parseCSV } from '../lib/csv-parser'
import { createOrder } from '@/features/orders/hooks/useOrders'
import { toast } from '@/shared/stores/toast-store'
import Button from '@/shared/components/Button'

export function SheetsImport() {
  const [csvText, setCsvText] = useState('')
  const [parsed, setParsed] = useState(null)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState(null)

  function handleParse() {
    if (!csvText.trim()) { toast.error('Вставьте CSV данные'); return }
    const result = parseCSV(csvText)
    setParsed(result)
    if (result.errors.length > 0) {
      toast.error(`Ошибки: ${result.errors.length}`)
    }
  }

  async function handleImport() {
    if (!parsed?.rows.length) return
    setImporting(true)
    let success = 0
    let failed = 0

    for (const row of parsed.rows) {
      try {
        await createOrder({
          order_type: row.order_type,
          width_mm: row.width_mm,
          height_mm: row.height_mm,
          qty: row.qty,
          design_variants: row.design_variants,
          need_lam: row.need_lam,
          is_3d: row.is_3d,
          film_type: row.film_type || 'G',
          deadline: row.deadline || null,
          notes: row.notes || '',
          price_final: row.price_final || null,
          price_per_unit: row.price_final ? Math.round(row.price_final / row.qty) : null,
        })
        success++
      } catch {
        failed++
      }
    }

    setResults({ success, failed })
    setImporting(false)
    toast.success(`Импортировано: ${success}, ошибок: ${failed}`)
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
      <h2 className="font-semibold">Импорт заказов из CSV</h2>
      <p className="text-sm text-text-muted">
        Вставьте данные из Google Sheets или CSV файла. Первая строка — заголовки.
        Поддерживаемые колонки: тип, ширина, высота, тираж, клиент, дедлайн, 3д, плёнка, ламинация, комментарий, цена.
      </p>

      <textarea
        value={csvText}
        onChange={(e) => setCsvText(e.target.value)}
        placeholder="тип;ширина;высота;тираж;клиент;дедлайн&#10;стикер;50;50;100;Иванов;2026-06-01"
        className="w-full h-40 rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text font-mono focus:outline-none focus:ring-2 focus:ring-accent/50 resize-y"
      />

      <div className="flex gap-2">
        <Button variant="secondary" onClick={handleParse}>Проверить</Button>
        {parsed?.rows.length > 0 && (
          <Button onClick={handleImport} loading={importing}>
            Импортировать ({parsed.rows.length} заказов)
          </Button>
        )}
      </div>

      {/* Parse errors */}
      {parsed?.errors.length > 0 && (
        <div className="bg-danger/10 border border-danger/20 rounded-lg p-3">
          <p className="text-sm font-medium text-danger mb-1">Ошибки парсинга:</p>
          {parsed.errors.map((e, i) => <p key={i} className="text-xs text-danger">{e}</p>)}
        </div>
      )}

      {/* Preview */}
      {parsed?.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Предпросмотр импорта</caption>
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 text-text-muted font-medium">Тип</th>
                <th className="text-right py-2 text-text-muted font-medium">Размер</th>
                <th className="text-right py-2 text-text-muted font-medium">Тираж</th>
                <th className="text-left py-2 text-text-muted font-medium">3D</th>
                <th className="text-left py-2 text-text-muted font-medium">Лам.</th>
                <th className="text-left py-2 text-text-muted font-medium">Дедлайн</th>
              </tr>
            </thead>
            <tbody>
              {parsed.rows.slice(0, 20).map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="py-1.5">{r.order_type}</td>
                  <td className="py-1.5 text-right">{r.width_mm}x{r.height_mm}</td>
                  <td className="py-1.5 text-right">{r.qty}</td>
                  <td className="py-1.5">{r.is_3d ? 'Да' : ''}</td>
                  <td className="py-1.5">{r.need_lam ? 'Да' : ''}</td>
                  <td className="py-1.5 text-text-muted">{r.deadline || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {parsed.rows.length > 20 && <p className="text-xs text-text-muted mt-1">...и ещё {parsed.rows.length - 20}</p>}
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="bg-success/10 border border-success/20 rounded-lg p-3">
          <p className="text-sm text-success">Готово: {results.success} импортировано, {results.failed} ошибок</p>
        </div>
      )}
    </div>
  )
}
