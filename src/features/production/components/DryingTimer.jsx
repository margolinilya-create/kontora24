import { useState, useEffect } from 'react'

export function DryingTimer({ dryUntil }) {
  const [remaining, setRemaining] = useState('')
  const [isDry, setIsDry] = useState(false)

  useEffect(() => {
    if (!dryUntil) return

    function update() {
      const diff = new Date(dryUntil) - new Date()
      if (diff <= 0) {
        setRemaining('Высохло')
        setIsDry(true)
        return
      }
      const hours = Math.floor(diff / 3600000)
      const minutes = Math.floor((diff % 3600000) / 60000)
      setRemaining(`${hours}ч ${minutes}мин`)
      setIsDry(false)
    }

    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [dryUntil])

  if (!dryUntil) return null

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
      isDry ? 'bg-green-500/15 text-green-500' : 'bg-cyan-500/15 text-cyan-500'
    }`}>
      {isDry ? 'Высохло' : `Сохнет: ${remaining}`}
    </span>
  )
}
