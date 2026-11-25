// R28.0 — хуки чтения CRM. Контракт проекта: { data, loading, error, refetch }.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'
import { captureError } from '@/shared/lib/sentry'
import {
  listCompanies, listContacts, getCompany, listCompanyOrders,
} from '../lib/crm-api'
import {
  listPipelines, listLostReasons, listDeals, getDeal, listDealOrders,
} from '../lib/deals-api'

/**
 * Общая обвязка: последний запрос побеждает (гонки при быстром вводе в поиск),
 * skeleton только при первой загрузке — повторные без мигания.
 * `key` — строка-ключ параметров: смена ключа = новый запрос.
 */
export function useAsyncData(loader, key, source) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const seqRef = useRef(0)
  const loaderRef = useRef(loader)
  // Обновляем до эффекта загрузки ниже (эффекты идут в порядке объявления).
  useEffect(() => { loaderRef.current = loader })

  const refetch = useCallback(async () => {
    const seq = ++seqRef.current
    setError(null)
    try {
      const result = await loaderRef.current()
      if (seq === seqRef.current) setData(result)
    } catch (err) {
      if (seq !== seqRef.current) return
      captureError(err, { tags: { source } })
      setError(err)
    } finally {
      if (seq === seqRef.current) setLoading(false)
    }
    // key в зависимостях намеренно: новый ключ → новый refetch → эффект ниже.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, source])

  useEffect(() => { refetch() }, [refetch])
  useRefetchOnFocus(refetch)

  // setData — для оптимистичных правок (канбан), следующий refetch всё сверит.
  return { data, loading, error, refetch, setData }
}

export function useCrmCompanies({ search = '', kind = 'all', archived = false, page = 1 }) {
  const res = useAsyncData(
    () => listCompanies({ search, kind, archived, page }),
    JSON.stringify([search, kind, archived, page]),
    'crm.useCrmCompanies',
  )
  return { ...res, rows: res.data?.rows || [], total: res.data?.total || 0 }
}

export function useCrmContacts({ search = '', archived = false, page = 1 }) {
  const res = useAsyncData(
    () => listContacts({ search, archived, page }),
    JSON.stringify([search, archived, page]),
    'crm.useCrmContacts',
  )
  return { ...res, rows: res.data?.rows || [], total: res.data?.total || 0 }
}

export function useCrmCompany(id) {
  return useAsyncData(
    async () => {
      if (!id) return null
      const [company, contacts, orders, deals] = await Promise.all([
        getCompany(id),
        listContacts({ clientId: id, page: 1 }),
        listCompanyOrders(id),
        listDeals({ clientId: id }),
      ])
      return { company, contacts: contacts.rows, orders, deals }
    },
    String(id),
    'crm.useCrmCompany',
  )
}

// ---------------------------------------------------------------------------
// R28.1 — сделки
// ---------------------------------------------------------------------------

/** Воронки (с этапами) + причины проигрыша — справочники доски и форм. */
export function useCrmDirectory() {
  const res = useAsyncData(
    async () => {
      const [pipelines, lostReasons] = await Promise.all([listPipelines(), listLostReasons()])
      return { pipelines, lostReasons }
    },
    'directory',
    'crm.useCrmDirectory',
  )
  return { ...res, pipelines: res.data?.pipelines || [], lostReasons: res.data?.lostReasons || [] }
}

export function useCrmDeals({ pipelineId, search = '', includeArchived = false }) {
  const res = useAsyncData(
    () => (pipelineId ? listDeals({ pipelineId, search, includeArchived }) : Promise.resolve([])),
    JSON.stringify([pipelineId, search, includeArchived]),
    'crm.useCrmDeals',
  )
  return { ...res, deals: res.data || [], setDeals: res.setData }
}

export function useCrmDeal(id) {
  return useAsyncData(
    async () => {
      if (!id) return null
      const [deal, orders] = await Promise.all([getDeal(id), listDealOrders(id)])
      return { deal, orders }
    },
    String(id),
    'crm.useCrmDeal',
  )
}
