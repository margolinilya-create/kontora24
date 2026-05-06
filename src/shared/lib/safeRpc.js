import { supabase } from './supabase'
import { captureError } from './sentry'

/**
 * Выполняет non-critical Supabase RPC.
 * Ошибка логируется в Sentry, но не throw'ается — поток выполнения
 * продолжается. Используй ТОЛЬКО для вторичных операций (учёт, аудит,
 * вспомогательные обновления), которые могут упасть без катастрофы для
 * пользователя.
 *
 * НЕ используй для критичных операций (смена статуса, создание заказа,
 * запись истории) — там ошибка должна throw'аться чтобы caller её ловил.
 *
 * @param {string} rpcName
 * @param {object} params
 * @param {{ source?: string, extra?: any }} [context]
 * @returns {Promise<void>}
 */
export async function safeRpc(rpcName, params, context = {}) {
  try {
    const { error } = await supabase.rpc(rpcName, params)
    if (error) throw error
  } catch (err) {
    captureError(err, {
      tags: {
        source: context.source || `safeRpc.${rpcName}`,
        rpc: rpcName,
      },
      extra: context.extra,
    })
  }
}
