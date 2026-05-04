import { useState, useEffect } from 'react'
import { useSettings } from '../hooks/useSettings'
import { toast } from '@/shared/stores/toast-store'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'

const FIELD_MAPPING_LABELS = {
  dealTitle: { bitrix: 'Название сделки', kontora: 'Тип заказа' },
  width: { bitrix: 'Ширина (мм)', kontora: 'width_mm' },
  height: { bitrix: 'Высота (мм)', kontora: 'height_mm' },
  qty: { bitrix: 'Количество', kontora: 'qty' },
  clientName: { bitrix: 'Имя клиента', kontora: 'client_name' },
}

const DEFAULT_BITRIX_CONFIG = {
  webhookUrl: '',
  enabled: false,
  fieldMapping: {
    dealTitle: 'order_type',
    width: 'width_mm',
    height: 'height_mm',
    qty: 'qty',
    clientName: 'client_name',
  },
}

export function BitrixSettings() {
  const { value: config, loading, save } = useSettings('bitrix')
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (config && !form) {
      setForm({ ...DEFAULT_BITRIX_CONFIG, ...config })
    } else if (!config && !form && !loading) {
      setForm({ ...DEFAULT_BITRIX_CONFIG })
    }
  }, [config, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleTest() {
    if (!form.webhookUrl) {
      toast.error('Введите URL вебхука')
      return
    }
    setTesting(true)
    try {
      const url = new URL(form.webhookUrl)
      if (!url.hostname.includes('bitrix')) {
        toast.info('URL не похож на Bitrix24 webhook')
      } else {
        toast.success('URL корректный')
      }
    } catch {
      toast.error('Некорректный URL')
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await save(form)
    } catch (err) {
      toast.error('Ошибка: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !form) {
    return (
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="font-semibold mb-4">Bitrix24</h2>
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 bg-border/50 rounded" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="font-semibold mb-4">Подключение Bitrix24</h2>

        <div className="space-y-4">
          <div>
            <Input
              id="bitrix-webhook-url"
              label="Webhook URL"
              type="url"
              value={form.webhookUrl}
              onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
              placeholder="https://your-domain.bitrix24.ru/rest/1/abc123/"
            />
            <p className="text-xs text-text-muted mt-1">
              Входящий вебхук из Bitrix24. Настройки &rarr; Вебхуки &rarr; Входящий вебхук.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="bitrix-enabled"
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              aria-label="Включить интеграцию с Bitrix24"
              className="rounded border-border text-accent focus:ring-accent/50"
            />
            <label htmlFor="bitrix-enabled" className="text-sm">
              Включена
            </label>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <Button variant="secondary" onClick={handleTest} loading={testing}>
            {testing ? 'Проверка...' : 'Тест URL'}
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="font-semibold mb-4">Маппинг полей</h2>
        <p className="text-sm text-text-muted mb-3">
          Соответствие полей Bitrix24 и Kontora24 при создании заказа через вебхук.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Маппинг полей Bitrix24</caption>
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 font-medium text-text-muted">Поле Bitrix24</th>
                <th className="text-left py-2 font-medium text-text-muted">Поле Kontora24</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(form.fieldMapping || {}).map(([key, value]) => {
                const labels = FIELD_MAPPING_LABELS[key] || { bitrix: key, kontora: value }
                return (
                  <tr key={key} className="border-b border-border last:border-0">
                    <td className="py-2.5">{labels.bitrix}</td>
                    <td className="py-2.5">
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => setForm({
                          ...form,
                          fieldMapping: { ...form.fieldMapping, [key]: e.target.value },
                        })}
                        aria-label={`Маппинг поля ${labels.bitrix}`}
                        className="rounded border border-border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 w-full max-w-xs"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
