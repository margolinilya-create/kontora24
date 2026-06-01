import { useState } from 'react'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useOrderSubtasks } from '../hooks/useOrderSubtasks'
import { usePackDesigns } from '@/features/production/hooks/usePackDesigns'
import { ExtraStickersModal } from './ExtraStickersModal'

// R11.3: кнопка видна только после стадии print (бриф 31.05).
// Cancelled / done — тоже скрываем.
const POST_PRINT_STAGES = new Set([
  'print', 'lamination', 'cutting', 'pouring', 'selection_pouring',
  'drying', 'selection', 'assembly_3d', 'packaging', 'otk',
])

/**
 * R11.3: «Создать подзадачу доп. стикеров».
 *
 * Видна авторизованным пользователям с production-ролью на любом этапе
 * после print. Открывает ExtraStickersModal где менеджер/печатник вводит
 * qty по видам.
 */
export function CreateExtraStickersButton({ order, onCreated }) {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  // Грузим pack_designs только если это 3D-стикерпак — для остальных typed
  // designs synthesized in modal.
  const { designs } = usePackDesigns(order?.order_type === 'stickerpack3D' ? order.id : null)
  const { createExtraStickers } = useOrderSubtasks(order.id, true)

  if (!profile) return null
  if (!POST_PRINT_STAGES.has(order.status)) return null

  async function handleCreate(payload) {
    await createExtraStickers(payload)
    onCreated?.()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded-lg border border-dashed border-border text-text-muted hover:text-text hover:border-text-muted/40 transition-colors"
      >
        + Стикеры дополнительно
      </button>

      <ExtraStickersModal
        isOpen={open}
        onClose={() => setOpen(false)}
        order={order}
        designs={designs}
        onCreate={handleCreate}
      />
    </>
  )
}
