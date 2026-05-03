import { useState, useEffect } from 'react'

export function OnboardingTip({ id, children, position = 'bottom' }) {
  const [show, setShow] = useState(false)
  const storageKey = `onboarding_${id}`

  useEffect(() => {
    if (!localStorage.getItem(storageKey)) {
      setShow(true)
    }
  }, [storageKey])

  function dismiss() {
    localStorage.setItem(storageKey, 'true')
    setShow(false)
  }

  if (!show) return null

  const positionClasses = {
    bottom: 'top-full left-0 mt-2',
    top: 'bottom-full left-0 mb-2',
    right: 'left-full top-0 ml-2',
  }

  return (
    <div role="status" aria-live="polite" className={`absolute ${positionClasses[position]} z-50 bg-accent text-white text-xs rounded-lg px-3 py-2 shadow-lg max-w-[200px] animate-slide-in`}>
      <p>{children}</p>
      <button onClick={dismiss} className="mt-1 text-white/70 hover:text-white text-[10px] underline min-h-[44px]">
        Понятно
      </button>
      {/* Arrow */}
      <div className={`absolute w-2 h-2 bg-accent rotate-45 ${position === 'bottom' ? '-top-1 left-4' : position === 'top' ? '-bottom-1 left-4' : '-left-1 top-3'}`} />
    </div>
  )
}
