import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-md' }) {
  const dialogRef = useRef(null)
  const previousFocusRef = useRef(null)
  const titleId = `modal-title-${title?.replace(/\s/g, '-')}`

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) return

    previousFocusRef.current = document.activeElement

    // Prevent body scroll while modal is open
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const dialog = dialogRef.current
    if (dialog) {
      const first = dialog.querySelector(FOCUSABLE)
      first?.focus()
    }

    return () => {
      document.body.style.overflow = originalOverflow
      previousFocusRef.current?.focus()
    }
  }, [isOpen])

  const handleTabTrap = (e) => {
    if (e.key !== 'Tab') return

    const dialog = dialogRef.current
    if (!dialog) return

    const focusable = [...dialog.querySelectorAll(FOCUSABLE)]
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleTabTrap}
        className={`relative bg-surface rounded-2xl border border-border shadow-modal animate-card-enter ${maxWidth} w-full max-h-[90vh] flex flex-col`}
      >
        <div className="flex justify-between items-center px-5 py-4 border-b border-border">
          <h2 id={titleId} className="text-lg font-semibold text-text font-display tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="text-text-muted hover:text-text hover:bg-surface-2 transition-colors rounded-lg w-9 h-9 flex items-center justify-center text-xl leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            &#215;
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  )
}
