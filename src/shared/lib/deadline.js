import { MS_PER_DAY } from '@/shared/constants'

export const DEADLINE_LEVELS = {
  ok:     { token: 'deadline-ok',     label: 'В срок' },
  warn:   { token: 'deadline-warn',   label: 'Скоро' },
  urgent: { token: 'deadline-urgent', label: 'Срочно' },
}

export function getDeadlineLevel(deadline, now = new Date()) {
  if (!deadline) return null
  const target = new Date(deadline)
  if (Number.isNaN(target.getTime())) return null
  const days = Math.ceil((target.getTime() - now.getTime()) / MS_PER_DAY)
  if (days <= 1) return 'urgent'
  if (days <= 2) return 'warn'
  return 'ok'
}

const TEXT_CLASSES = {
  ok: 'text-deadline-ok',
  warn: 'text-deadline-warn',
  urgent: 'text-deadline-urgent',
}

const BG_CLASSES = {
  ok: 'bg-deadline-ok/15 text-deadline-ok',
  warn: 'bg-deadline-warn/15 text-deadline-warn',
  urgent: 'bg-deadline-urgent/15 text-deadline-urgent',
}

export function getDeadlineClasses(deadline, now) {
  const level = getDeadlineLevel(deadline, now)
  return level ? TEXT_CLASSES[level] : ''
}

export function getDeadlineBadgeClasses(deadline, now) {
  const level = getDeadlineLevel(deadline, now)
  return level ? BG_CLASSES[level] : ''
}
