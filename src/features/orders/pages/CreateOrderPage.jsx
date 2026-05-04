import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createOrder } from '../hooks/useOrders'
import { ORDER_TYPES, PRIORITIES, LAMINATION_TYPES } from '@/shared/constants'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/stores/toast-store'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'

const schema = z.object({
  order_type: z.string().min(1, 'Выберите тип'),
  qty: z.coerce.number().min(1, 'Минимум 1'),
  width_mm: z.coerce.number().min(1, 'Укажите ширину'),
  height_mm: z.coerce.number().min(1, 'Укажите высоту'),
  lam_type: z.string().optional(),
  client_name: z.string().optional(),
  deadline: z.string().optional(),
  priority: z.string().default('normal'),
  notes: z.string().optional(),
  design_variants: z.coerce.number().min(1).default(1),
})

export default function CreateOrderPage() {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { order_type: '', qty: 1, width_mm: 100, height_mm: 100, lam_type: '', priority: 'normal', design_variants: 1 },
  })

  const lamType = watch('lam_type')
  const needLam = lamType === 'matte' || lamType === 'glossy'

  async function onSubmit(values) {
    setSubmitting(true)
    try {
      // Find or create client
      let clientId = null
      if (values.client_name?.trim()) {
        const { data: existing } = await supabase
          .from('k24_clients')
          .select('id')
          .eq('name', values.client_name.trim())
          .limit(1)
          .single()

        if (existing) {
          clientId = existing.id
        } else {
          const { data: newClient } = await supabase
            .from('k24_clients')
            .insert({ name: values.client_name.trim() })
            .select('id')
            .single()
          if (newClient) clientId = newClient.id
        }
      }

      const order = await createOrder({
        order_type: values.order_type,
        qty: values.qty,
        width_mm: values.width_mm,
        height_mm: values.height_mm,
        need_lam: needLam,
        lam_type: needLam ? values.lam_type : null,
        client_id: clientId,
        deadline: values.deadline || null,
        priority: values.priority,
        notes: values.notes || null,
        design_variants: values.design_variants,
      })

      toast.success(`Заказ ORD-${String(order.number).padStart(4, '0')} создан`)
      navigate(`/orders/${order.id}`)
    } catch (err) {
      toast.error('Ошибка: ' + (err.message || 'Не удалось создать заказ'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Новый заказ</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Order type */}
        <div>
          <label className="block text-sm font-medium mb-1">Тип продукции *</label>
          <select {...register('order_type')} className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm">
            <option value="">Выберите тип</option>
            {Object.entries(ORDER_TYPES).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          {errors.order_type && <p className="text-red-400 text-xs mt-1">{errors.order_type.message}</p>}
        </div>

        {/* Dimensions + Qty */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Ширина, мм *</label>
            <Input type="number" {...register('width_mm')} />
            {errors.width_mm && <p className="text-red-400 text-xs mt-1">{errors.width_mm.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Высота, мм *</label>
            <Input type="number" {...register('height_mm')} />
            {errors.height_mm && <p className="text-red-400 text-xs mt-1">{errors.height_mm.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Тираж, шт *</label>
            <Input type="number" {...register('qty')} />
            {errors.qty && <p className="text-red-400 text-xs mt-1">{errors.qty.message}</p>}
          </div>
        </div>

        {/* Design variants */}
        <div>
          <label className="block text-sm font-medium mb-1">Видов дизайна</label>
          <Input type="number" min="1" {...register('design_variants')} />
        </div>

        {/* Lamination */}
        <div>
          <label className="block text-sm font-medium mb-1">Ламинация</label>
          <select {...register('lam_type')} className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm">
            <option value="">Без ламинации</option>
            {Object.entries(LAMINATION_TYPES).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {/* Client */}
        <div>
          <label className="block text-sm font-medium mb-1">Заказчик</label>
          <Input type="text" placeholder="Имя клиента" {...register('client_name')} />
        </div>

        {/* Deadline */}
        <div>
          <label className="block text-sm font-medium mb-1">Срок сдачи</label>
          <Input type="date" {...register('deadline')} />
        </div>

        {/* Priority */}
        <div>
          <label className="block text-sm font-medium mb-1">Приоритет</label>
          <select {...register('priority')} className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm">
            {Object.entries(PRIORITIES).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium mb-1">Комментарий</label>
          <textarea
            {...register('notes')}
            rows={3}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm resize-none"
            placeholder="Ссылка на макет, особенности заказа..."
          />
        </div>

        {/* Submit */}
        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={submitting}>Создать заказ</Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/orders')}>Отмена</Button>
        </div>
      </form>
    </div>
  )
}
