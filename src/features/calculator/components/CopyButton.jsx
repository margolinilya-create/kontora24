import { useEffect, useRef, useState } from 'react'
import Button from '@/shared/components/Button'
import { toast } from '@/shared/stores/toast-store'
import { copyText } from '../lib/copy-text'

/** Кнопка копирования: на 2 с превращается в «✓ Скопировано» + тост (ТЗ 5.4). */
export function CopyButton({ getText, children, variant = 'secondary', size = 'md', className = '', disabled }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  async function handleClick() {
    const ok = await copyText(getText())
    if (!ok) {
      toast.error('Не удалось скопировать — выделите текст вручную')
      return
    }
    toast.success('Расчёт скопирован')
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button type="button" variant={variant} size={size} onClick={handleClick} disabled={disabled} className={className}>
      {copied ? '✓ Скопировано' : children}
    </Button>
  )
}
