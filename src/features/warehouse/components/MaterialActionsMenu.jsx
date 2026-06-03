import { useState } from 'react'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { archiveMaterial, unarchiveMaterial, deleteMaterial } from '../hooks/useMaterials'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import ConfirmDialog from '@/shared/components/ConfirmDialog'
import { MaterialEditModal } from './MaterialEditModal'

// R13.1 (бриф 02.06): меню действий «⋯» на позиции склада.
// Edit / Архивировать (или Разархивировать) / Удалить.
// Удаление через ConfirmDialog с проверкой связанных транзакций
// (deleteMaterial бросает HAS_TRANSACTIONS при наличии).
export function MaterialActionsMenu({ material, onUpdated, className = '' }) {
  const canArchive = useCanDo('material:archive')
  const canDelete = useCanDo('material:delete')
  const [menuOpen, setMenuOpen] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [working, setWorking] = useState(false)

  if (!canArchive && !canDelete) return null

  const isArchived = !!material.archived_at

  async function handleArchive() {
    setMenuOpen(false)
    setWorking(true)
    try {
      if (isArchived) {
        await unarchiveMaterial(material.id)
        toast.success('Позиция разархивирована')
      } else {
        await archiveMaterial(material.id)
        toast.success('Позиция архивирована')
      }
      onUpdated()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setWorking(false)
    }
  }

  async function handleDelete() {
    setConfirmDelete(false)
    setWorking(true)
    try {
      await deleteMaterial(material.id)
      toast.success('Позиция удалена')
      onUpdated()
    } catch (err) {
      if (err.code === 'HAS_TRANSACTIONS') {
        toast.error(err.message)
      } else {
        toast.error(translateError(err).message)
      }
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <div className={`relative inline-block ${className}`}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
          onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
          disabled={working}
          aria-label="Действия"
          className="px-2 py-1 rounded hover:bg-surface-dim text-text-muted hover:text-text transition-colors min-h-[32px] min-w-[32px]"
        >
          ⋯
        </button>
        {menuOpen && (
          <ul
            role="menu"
            className="absolute z-30 right-0 mt-1 min-w-[180px] rounded-xl border border-border bg-surface shadow-xl overflow-hidden"
          >
            {canArchive && (
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setShowEdit(true); setMenuOpen(false) }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-2"
                >
                  Редактировать
                </button>
              </li>
            )}
            {canArchive && (
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleArchive() }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-2"
                >
                  {isArchived ? 'Разархивировать' : 'Архивировать'}
                </button>
              </li>
            )}
            {canDelete && (
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setConfirmDelete(true); setMenuOpen(false) }}
                  className="w-full text-left px-4 py-2.5 text-sm text-danger hover:bg-danger/10"
                >
                  Удалить
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      {showEdit && (
        <MaterialEditModal
          material={material}
          onClose={() => setShowEdit(false)}
          onUpdated={() => { setShowEdit(false); onUpdated() }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
          title="Удалить позицию?"
          message={`«${material.name}» будет полностью удалена. Если есть связанные транзакции, удаление будет заблокировано — используйте архивацию.`}
          confirmText="Удалить"
          variant="danger"
        />
      )}
    </>
  )
}
