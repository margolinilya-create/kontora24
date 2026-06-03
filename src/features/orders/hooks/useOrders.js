import { useState, useEffect, useCallback, useId, useRef } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { isDualTrack, getNextStatus, ORDER_STATUSES, DUAL_TRACK_STAGES, isStageAllowed, canAdvanceFrom } from '@/shared/constants'
import { useRolePermissionsStore, canRoleDo } from '@/features/auth/role-permissions-store'
import { useAuthStore } from '@/features/auth/store'
import { useRoleSwitcherStore } from '@/shared/stores/role-switcher-store'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
// safeRpc убран вместе с auto_deduct_materials (12.05)
import { captureError } from '@/shared/lib/sentry'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'
import { getFreshAccessToken } from '@/shared/lib/auth-token'

/** Этапы, на которых заказ нельзя двигать вперёд без введённых данных. */
// R11.1: sample_print требует sample_film_meters (расход плёнки на образец),
// selection — qty_selected. drying / color_approval / sample_layout / batch_layout
// НЕ требуют — это либо ожидание (drying таймер), либо без производственных
// данных (sample/batch верстка, color_approval).
const STAGES_REQUIRING_COMPLETION = new Set([
  'sample_print', 'print', 'lamination', 'cutting', 'pouring',
  'selection_pouring', 'selection', 'assembly_3d', 'packaging',
])

// Финансовые поля k24_orders — видны только admin/manager (view:finance).
// Аудит 18.05: воркеры получали price_final/cost_total через прямой SELECT
// и могли увидеть их в DevTools, хотя в UI они скрыты. Фикс — фронт-условный
// SELECT по эффективной роли. Серверная защита WRITE — триггер
// k24_protect_order_columns (миграция 20260505_security_phase2).
const LIST_FIELDS_BASE = `id, number, custom_number, client_id, status, order_type, qty, width_mm, height_mm,
  film_type, lam_type, need_lam, design_status, priority, deadline, created_at, updated_at,
  assigned_to, created_by, bopp_bag, is_urgent, notes, deal_name, bitrix_deal_id, mockup_path,
  stickers_per_pack, design_variants`

const LIST_FIELDS_FINANCE = `, price_final, cost_total`

const LIST_RELATIONS = `,
  client:k24_clients(name, phone),
  assignee:k24_profiles!assigned_to(display_name, role),
  attachments:k24_order_attachments(id, file_name, file_path, mime_type)`

const DETAIL_FIELDS_BASE = `id, number, custom_number, client_id, order_type, status, width_mm, height_mm,
  qty, design_variants, need_lam, lam_type, prod_days, assigned_to, created_by, deadline, notes,
  created_at, updated_at, bitrix_deal_id, bitrix_url, priority, checklist, status_changed_at,
  film_type, stickers_per_pack, is_3d, mockup_path, is_urgent, is_partner, needs_montage_film,
  needs_individual_cut, printed_meters, resin_used, rejected_qty, printed_qty, deal_name,
  source, source_referrer, design_status, delivery_type, delivery_city, delivery_address,
  delivery_notes, bopp_bag, film_type_stickers, ink_deducted_at`

const DETAIL_FIELDS_FINANCE = `, cost_materials, cost_labor, cost_total, markup, discount_pct,
  price_final, price_per_unit, payment_status`

const DETAIL_RELATIONS = `,
  client:k24_clients(*),
  assignee:k24_profiles!assigned_to(*),
  creator:k24_profiles!created_by(*),
  attachments:k24_order_attachments(id, file_name, file_path, mime_type)`

async function fetchWithRetry(url, options, retries = 3, delays = [1000, 5000, 15000]) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options)
      if (res.ok) return res
      if (i < retries) await new Promise(r => setTimeout(r, delays[i]))
    } catch {
      if (i < retries) await new Promise(r => setTimeout(r, delays[i]))
    }
  }
}

export function useOrders(filters = {}) {
  const hookId = useId()
  const [orders, setOrders] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const canSeeFinance = useCanDo('view:finance')

  // Serialize statuses array to a primitive so the deps array stays stable.
  const statusesKey = filters.statuses?.join(',') ?? ''

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Только поля, необходимые для списков/канбана/календаря/дашборда.
      // Полная карточка заказа подгружается через useOrderDetail.
      const SELECT_LIST = `${LIST_FIELDS_BASE}${canSeeFinance ? LIST_FIELDS_FINANCE : ''}${LIST_RELATIONS}`
      let query = supabase
        .from('k24_orders')
        .select(SELECT_LIST, { count: 'exact' })

      // Filters
      if (filters.statuses && filters.statuses.length > 0) {
        query = query.in('status', filters.statuses)
      } else if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }
      if (filters.orderType && filters.orderType !== 'all') {
        query = query.eq('order_type', filters.orderType)
      }
      if (filters.deadlineFrom) {
        query = query.gte('deadline', filters.deadlineFrom)
      }
      if (filters.deadlineTo) {
        query = query.lte('deadline', filters.deadlineTo)
      }
      if (filters.search) {
        // Sanitize: remove PostgREST operators and escape SQL LIKE wildcards
        const s = filters.search.replace(/[,()]/g, '').replace(/[%_\\]/g, '\\$&')

        // R13.0 (бриф 02.06): поиск расширен на custom_number и client.name.
        // client.name матчим через предварительный запрос к k24_clients →
        // массив client_id → подмешиваем в or().
        const { data: clientMatches } = await supabase
          .from('k24_clients')
          .select('id')
          .ilike('name', `%${s}%`)
          .limit(50)
        const clientIds = (clientMatches || []).map((c) => c.id)

        const orParts = []
        const num = parseInt(s, 10)
        if (!isNaN(num)) orParts.push(`number.eq.${num}`)
        orParts.push(`custom_number.ilike.%${s}%`)
        orParts.push(`notes.ilike.%${s}%`)
        if (clientIds.length > 0) {
          orParts.push(`client_id.in.(${clientIds.join(',')})`)
        }
        query = query.or(orParts.join(','))
      }

      // Sort
      const sortCol = filters.sortBy || 'created_at'
      const sortAsc = filters.sortAsc ?? false
      query = query.order(sortCol, { ascending: sortAsc })

      // Pagination
      if (filters.from !== undefined && filters.to !== undefined) {
        query = query.range(filters.from, filters.to)
      }

      const { data, error: err, count } = await query
      if (err) throw err
      setOrders(data || [])
      setTotalCount(count || 0)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- statusesKey is the serialized form of filters.statuses
  }, [filters.status, statusesKey, filters.orderType, filters.search, filters.sortBy, filters.sortAsc, filters.from, filters.to, filters.deadlineFrom, filters.deadlineTo, canSeeFinance])

  useEffect(() => { fetchOrders() }, [fetchOrders])
  useRefetchOnFocus(fetchOrders)

  // Realtime — stable subscription (doesn't re-subscribe on filter change)
  const fetchRef = useRef(fetchOrders)
  useEffect(() => { fetchRef.current = fetchOrders }, [fetchOrders])

  const debounceRef = useRef(null)
  useEffect(() => {
    const channelName = `orders-${hookId.replace(/:/g, '')}`
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'k24_orders' }, () => {
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => fetchRef.current(), 500)
      })
      .subscribe()
    return () => {
      clearTimeout(debounceRef.current)
      supabase.removeChannel(channel)
    }
  }, [hookId])

  return { orders, totalCount, loading, error, refetch: fetchOrders }
}

export function useOrderDetail(id) {
  const [order, setOrder] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const canSeeFinance = useCanDo('view:finance')

  const fetchDetail = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const detailSelect = `${DETAIL_FIELDS_BASE}${canSeeFinance ? DETAIL_FIELDS_FINANCE : ''}${DETAIL_RELATIONS}`
      const [orderRes, historyRes] = await Promise.all([
        supabase
          .from('k24_orders')
          .select(detailSelect)
          .eq('id', id)
          .single(),
        supabase
          .from('k24_order_status_history')
          .select('*, changed_by_profile:k24_profiles!changed_by(display_name, role)')
          .eq('order_id', id)
          .order('created_at', { ascending: false }),
      ])
      if (orderRes.error) throw orderRes.error
      setOrder(orderRes.data)
      setHistory(historyRes.data || [])
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [id, canSeeFinance])

  useEffect(() => { fetchDetail() }, [fetchDetail])
  useRefetchOnFocus(fetchDetail)

  // setOrder экспортируем для optimistic updates (R9.3B): после save AdminOrderEditor
  // вызывает setOrder(prev => ({...prev, ...updates})) вместо тяжёлого refetch.
  // Это убирает «перезагрузку страницы» при сохранении (бриф 26.05).
  return { order, history, loading, error, refetch: fetchDetail, setOrder }
}

export function useProfiles(role) {
  const [profiles, setProfiles] = useState([])
  const [error, setError] = useState(null)
  useEffect(() => {
    async function fetch() {
      try {
        let query = supabase.from('k24_profiles').select('id, display_name, role')
        if (role) query = query.eq('role', role)
        const { data, error: err } = await query.order('display_name')
        if (err) throw err
        setProfiles(data || [])
        setError(null)
      } catch (err) {
        setError(err)
        captureError(err, {
          tags: { source: 'useProfiles' },
          extra: { role },
        })
      }
    }
    fetch()
  }, [role])
  return { profiles, error }
}

export async function createOrder(orderData) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('k24_orders')
    .insert({ ...orderData, created_by: user.id, status: 'new' })
    .select()
    .single()
  if (error) throw error

  const { error: historyError } = await supabase.from('k24_order_status_history').insert({
    order_id: data.id, from_status: null, to_status: 'new', changed_by: user.id,
  })
  if (historyError) throw historyError

  return data
}

/**
 * Сменить статус заказа.
 *
 * @param {string} orderId
 * @param {string} fromStatus
 * @param {string} toStatus
 * @param {{ isRollback?: boolean, force?: boolean }} [options]
 *   `isRollback` — переход назад по маршруту, блокировка пропускается.
 *   `force` — пропустить блокировку (только для admin/manager override).
 */
export async function updateOrderStatus(orderId, fromStatus, toStatus, options = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Блокировка перехода в стадию, которая не входит в маршрут заказа.
  // isRollback / force — admin escape (StatusOverride).
  let orderForRoute = null
  if (!options.isRollback && !options.force) {
    const { data: o } = await supabase
      .from('k24_orders')
      .select('order_type, design_status, need_lam, number')
      .eq('id', orderId)
      .single()
    orderForRoute = o
    if (orderForRoute && !isStageAllowed(orderForRoute, toStatus)) {
      const stageLabel = ORDER_STATUSES[toStatus]?.label || toStatus
      throw new Error(`Этап «${stageLabel}» не входит в маршрут заказа`)
    }

    // L2 RBAC: если динамические права загружены — проверяем что у роли есть
    // право продвигать этот этап (stage:${fromStatus}). Без права — отказ.
    // Тесты и старт-апа (до load()) используют статический ROLE_STAGE_PERMISSIONS.
    if (fromStatus) {
      const { data: actorProfile, error: actorErr } = await supabase
        .from('k24_profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (actorErr) {
        captureError(actorErr, { tags: { source: 'updateOrderStatus.actorProfile' }, extra: { userId: user.id } })
        throw new Error('Не удалось проверить права. Обновите страницу и попробуйте снова.')
      }
      const role = actorProfile?.role
      const store = useRolePermissionsStore.getState()
      const dynamicPerms = store.loaded ? store.permissions : null
      if (role && !canAdvanceFrom(role, fromStatus, dynamicPerms)) {
        const stageLabel = ORDER_STATUSES[fromStatus]?.label || fromStatus
        throw new Error(`У роли «${role}» нет права продвигать этап «${stageLabel}»`)
      }
    }
  }

  // Блокировка перехода вперёд без введённых данных на текущем этапе
  if (!options.isRollback && !options.force && fromStatus && STAGES_REQUIRING_COMPLETION.has(fromStatus)) {
    const order = orderForRoute || (await supabase
      .from('k24_orders')
      .select('order_type')
      .eq('id', orderId)
      .single()).data

    const isPack3D = order?.order_type === 'stickerpack3D'
    const tracks = isPack3D && DUAL_TRACK_STAGES.includes(fromStatus) ? ['backgrounds', 'stickers'] : [null]

    for (const track of tracks) {
      const { data: result, error: checkError } = await supabase.rpc('check_stage_completion', {
        p_order_id: orderId,
        p_stage: fromStatus,
        p_track: track,
      })
      if (checkError) {
        // Если RPC недоступна — лучше пропустить заказ (degrade gracefully), чем заблокировать
        captureError(checkError, { tags: { source: 'updateOrderStatus.checkCompletion' }, extra: { orderId, fromStatus, track } })
        break
      }
      if (!result?.is_complete) {
        const stageLabel = ORDER_STATUSES[fromStatus]?.label || fromStatus
        const trackLabel = track === 'backgrounds' ? ' (фоны)' : track === 'stickers' ? ' (стикеры)' : ''
        throw new Error(`Этап «${stageLabel}»${trackLabel} не завершён. Сначала введите данные на странице заказа.`)
      }
    }
  }

  const { error } = await supabase
    .from('k24_orders')
    .update({ status: toStatus, updated_at: new Date().toISOString() })
    .eq('id', orderId)
  if (error) throw error

  const { error: historyError } = await supabase.from('k24_order_status_history').insert({
    order_id: orderId, from_status: fromStatus, to_status: toStatus, changed_by: user.id,
  })
  if (historyError) throw historyError

  // Авто-расход краски отключён 12.05 по запросу менеджера.
  // Плёнка/ламинация/смола списываются триггером deduct_materials_from_log
  // по фактическим цифрам из k24_production_logs (миграции 021 + 025).
  // Краска теперь учитывается только вручную через инвентаризацию.

  // Notify Bitrix24 about status change (non-blocking with retry).
  // Финансовые поля включаем в SELECT только для admin/manager — серверный
  // endpoint использует их только при status='done' (UF_COST_TOTAL/UF_PRICE_FINAL),
  // а до 'done' заказ доводит менеджер. Воркер price_final/cost_total не получает.
  try {
    const role = useRoleSwitcherStore.getState().impersonatedProfile?.role
      ?? useAuthStore.getState().profile?.role
    const canSeeFinance = canRoleDo(role, 'view:finance')
    const notifySelect = canSeeFinance
      ? 'number, bitrix_deal_id, price_final, cost_total'
      : 'number, bitrix_deal_id'
    const { data: order } = await supabase.from('k24_orders').select(notifySelect).eq('id', orderId).single()
    if (order?.bitrix_deal_id) {
      fetchWithRetry('/api/bitrix/status-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          order_number: order.number,
          status: toStatus,
          price_final: order.price_final,
          cost_total: order.cost_total,
          bitrix_deal_id: order.bitrix_deal_id,
        }),
      }).catch(() => {}) // silent fail after all retries
    }
  } catch (err) {
    captureError(err, { tags: { source: 'updateOrderStatus.notifyBitrix' }, extra: { orderId } })
  }
}

/**
 * Add a production log entry and CHECK (but do not perform) status advance.
 *
 * Возвращает { is_complete, next_status } — UI решает показывать ConfirmDialog
 * «Завершить этап?» или нет (фидбэк менеджера 17.05: убрать авто-переход).
 *
 * Для stickerpack3D на dual-track этапах (print/cutting/selection_pouring)
 * оба трека (backgrounds + stickers) должны быть завершены.
 */
export async function addProductionLogAndCheckAdvance(orderId, stage, logData, order) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // 1. Insert production log (pass track field if present)
  const { error } = await supabase.from('k24_production_logs').insert({
    order_id: orderId,
    stage,
    worker_id: user.id,
    ...logData,
  })
  if (error) throw error

  // 2. Check if stage is complete

  // Get worker's actual role for permission check.
  // Если профиль не нашёлся — НЕ дефолтим на 'post_printer' (это могло бы
  // дать левые права при недоступности RLS). Без роли просто не считаем
  // next_status (advance не произойдёт автоматически).
  const { data: workerProfile, error: workerErr } = await supabase
    .from('k24_profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (workerErr) {
    captureError(workerErr, { tags: { source: 'addProductionLogAndCheckAdvance.workerProfile' }, extra: { userId: user.id } })
  }
  const workerRole = workerProfile?.role || null

  let isComplete = false

  try {
    if (isDualTrack(stage, order)) {
      // For dual-track stages on stickerpack3D: both tracks must be complete
      const [bgResult, stResult] = await Promise.all([
        supabase.rpc('check_stage_completion', {
          p_order_id: orderId,
          p_stage: stage,
          p_track: 'backgrounds',
        }),
        supabase.rpc('check_stage_completion', {
          p_order_id: orderId,
          p_stage: stage,
          p_track: 'stickers',
        }),
      ])
      if (bgResult.error) {
        captureError(bgResult.error, {
          tags: { source: 'addProductionLogAndCheckAdvance.checkCompletion.backgrounds' },
          extra: { orderId, stage },
        })
      }
      if (stResult.error) {
        captureError(stResult.error, {
          tags: { source: 'addProductionLogAndCheckAdvance.checkCompletion.stickers' },
          extra: { orderId, stage },
        })
      }
      isComplete = (bgResult.data?.is_complete ?? false) && (stResult.data?.is_complete ?? false)
    } else {
      const { data: result, error: checkError } = await supabase.rpc('check_stage_completion', {
        p_order_id: orderId,
        p_stage: stage,
      })
      if (checkError) {
        captureError(checkError, {
          tags: { source: 'addProductionLogAndCheckAdvance.checkCompletion' },
          extra: { orderId, stage },
        })
      }
      isComplete = result?.is_complete ?? false
    }
  } catch (err) {
    captureError(err, {
      tags: { source: 'addProductionLogAndCheckAdvance.checkCompletion' },
      extra: { orderId, stage },
    })
    // isComplete остаётся false → advance не произойдёт, что безопаснее чем
    // продолжать с потенциально некорректным значением
  }

  // 3. Compute next_status (но НЕ продвигаем). UI решает через ConfirmDialog.
  // Без workerRole next_status не считаем — пусть UI не покажет prompt,
  // менеджер двинет статус вручную. Лучше чем дать левый advance.
  let nextStatus = null
  if (isComplete && order && workerRole) {
    const store = useRolePermissionsStore.getState()
    const dynamicPerms = store.loaded ? store.permissions : null
    nextStatus = getNextStatus(workerRole, order.status, order, dynamicPerms)
  }

  // 4. Для 3D-стикерпака — определить, завершился ли конкретный трек.
  // UI откроет ConfirmDialog «Отправить фоны/стикеры на N?» (фидбэк 17.05, R7).
  let completedTrack = null
  if (order?.order_type === 'stickerpack3D' && logData.track) {
    const { data: trackRes } = await supabase.rpc('check_stage_completion', {
      p_order_id: orderId,
      p_stage: stage,
      p_track: logData.track,
    })
    if (trackRes?.is_complete) {
      completedTrack = logData.track
    }
  }

  return { is_complete: isComplete, next_status: nextStatus, completed_track: completedTrack }
}

export async function updateOrder(orderId, updates) {
  const patch = { ...updates, updated_at: new Date().toISOString() }
  const { error } = await supabase
    .from('k24_orders')
    .update(patch)
    .eq('id', orderId)
  if (error) throw error
  return patch
}

/**
 * Удалить заказ полностью (только admin).
 * Идёт через /api/orders/delete — service_role-эндпоинт, который проверяет роль,
 * чистит файлы вложений и обнуляет integration_log.order_id перед DELETE.
 */
export async function deleteOrder(orderId) {
  const accessToken = await getFreshAccessToken()
  const res = await fetch('/api/orders/delete', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ orderId }),
  })
  const result = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = result.detail ? `${result.error} — ${result.detail}` : result.error || 'Ошибка удаления'
    throw new Error(msg)
  }
}

