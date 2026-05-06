# Phase 4.2.2 Sweep — Полный inventory supabase awaits в src/

Дата: 2026-05-06.
Источник: 5 grep'ов из брифа + дополнительный grep `await query|Promise.all` для chained-paths.
Test files (`.test.`) исключены.

---

## ALREADY-HANDLED (покрыто в Phase 1-4.2.1)

| File:line | Operation | Has error check? | Phase |
|---|---|---|---|
| useOrders.js:70 | from select orders | ✓ try/catch + setError(err) | 4.2.1 (Batch A unify) |
| useOrders.js:118 | Promise.all order+history | ✓ try/catch + `if (orderRes.error) throw` | 4.2.1 |
| useOrders.js:170 | insert order_status_history | ✓ throw if historyError | 4.2.1 |
| useOrders.js:176 | rpc reserve_materials | ✓ Sentry + throw + partialState | 4.2.1 |
| useOrders.js:204 | insert order_status_history | ✓ throw if historyError | 4.2.1 |
| useOrders.js:211 | rpc auto_deduct_materials | ✓ safeRpc | 4.2 |
| useOrders.js:214 | rpc consume_reservations | ✓ safeRpc | 4.2 |
| useOrders.js:221 | rpc release_materials | ✓ safeRpc | 4.2 |
| useOrders.js:228 | from select orders.single (notifyBitrix) | ✓ try/catch + captureError | 4.2 |
| useOrders.js:260 | insert k24_production_logs | ✓ if (error) throw | pre-existing |
| useOrders.js:283-289 | rpc check_stage_completion (dual) | ✓ explicit `if (bgResult.error)` + `if (stResult.error)` + Sentry | 4.2.1 |
| useOrders.js:309 | rpc check_stage_completion (single) | ✓ checkError + Sentry | 4.2.1 |
| useOrders.js:366 | from update orders.select (claimOrder) | ✓ if (error) throw | pre-existing |
| useClients.js:23 | from select clients | ✓ try/catch + setError(err) | Batch B (Phase 2.1) |
| useCabinetStats.js:26 | Promise.all logs+shifts | ✓ try/catch + `if (logsRes.error) throw` | Phase 2.1 |
| useSettings.js:14 | from select settings | ✓ try/catch + PGRST116 special-case | Phase 2.1 |
| useSettings.js:75 | fetch /api/users/update | ✓ `if (!res.ok) throw` | pre-existing |
| useShiftTracker.js:49 | insert shift_entries (clockIn) | ✓ if (error) throw | pre-existing |
| useShiftTracker.js:62 | update shift_entries (clockOut) | ✓ if (error) throw | pre-existing |
| useMaterials.js:14 | Promise.all materials+reservations | ✓ try/catch + `if (results[0].error) throw` + setError(err) | 4.2.1 |
| useMaterials.js:81 | insert material_transactions | ✓ if (error) throw | pre-existing |
| useMaterials.js:91 | rpc update_stock | ✓ if (rpcError) → rollback + throw | pre-existing |
| useProductionLogs.js:48 | insert production_logs | ✓ if (error) throw | pre-existing |
| OrderAttachments.jsx:fetchFiles | from select attachments | ✓ try/catch + captureError | 4.2.1 |
| OrderAttachments.jsx:58 | storage upload | ✓ if (uploadError) throw | pre-existing |
| OrderAttachments.jsx:63 | insert order_attachments | ✓ if (dbError) throw | pre-existing |
| OrderAttachments.jsx:94 | storage remove (handleDelete) | ✓ captureError, не throw (DB уже delete) | 4.2 |
| OrderComments.jsx:45 | insert order_comments | ✓ if (error) throw | pre-existing |
| MaterialConsumption.jsx:43 | insert material_transactions | ✓ if (error) throw | pre-existing |
| MaterialConsumption.jsx:52 | rpc update_stock | ✓ if (rpcError) throw | pre-existing |
| sidebar-store.js:18 | Promise.all orders+materials | ✓ try/catch + captureError | 4.1 |
| safeAsync.js | wraps any thunk | ✓ try/catch + Sentry | Phase 1 |
| safeRpc.js:21 | wraps supabase.rpc | ✓ try/catch + Sentry | 4.2 |
| auth/store.js:11-17 | getSession + profile select (init) | ✓ outer try/catch (silent for init OK) | pre-existing |
| auth/store.js:54 | signInWithPassword | ✓ if (error) throw | pre-existing |
| LoginForm.jsx:30 | resetPasswordForEmail | ✓ if (error) check | pre-existing |

**~36 точек already-handled.**

---

## FIX-NOW (silent fail с реальным риском, рекомендую починить сейчас)

| File:line | Operation | Class | Why fix-now |
|---|---|---|---|
| **OperationChecklist.jsx:16** | `await supabase.from('k24_orders').update({ checklist }).eq('id')` | **critical (audit)** | Optimistic update: `setChecklist(updated)` ВЫПОЛНЯЕТСЯ ДО await. Если DB upadает — UI checked, БД нет. Юзер думает "выполнено", при reload checkmark пропадёт без объяснения. |
| **CompleteTaskModal.jsx:48** | `await supabase.from('k24_time_entries').update({ ended_at, duration_minutes })` | critical (audit) | Silent — таймер не закроется в БД, останется orphan timer + неточный учёт времени смены. Внутри outer try/catch, JS-throws ловится, но return-error silent. |
| **CompleteTaskModal.jsx:59** | `await supabase.from('k24_material_transactions').insert(...)` | critical (audit) | Silent insert — расход материала не записан → stock drift. Юзер видит success. |
| **CompleteTaskModal.jsx:66** | `await supabase.rpc('update_stock', { p_delta: -qty })` | critical (consistency) | Silent — если транзакция вставлена (line 59), а stock не обновлён → расхождение transactions vs stock_qty. Класс «consistency» — заметят при ревизии. |
| **useProductionLogs.js:17** | `await supabase.from('k24_production_logs').select(...)` | read | Silent: на ошибке logs=[], user видит «нет записей», прогресс-бар пуст. Используется в OrderProgressTab/ReportsTab/StageInput. Без error в return → нельзя показать ErrorState. |
| **useProductionLogs.js — return** | Хук не экспортит `error` | read | Симметрично Phase 2.1: пробросить error для будущих ErrorState. |
| **useShiftTracker.js:21** (fetchShiftData) | `Promise.all` shift_entries | read | Silent: на ошибке activeShift=null, todayMinutes=0. UI показывает «Сегодня: 0мин» как валидное состояние. Misleading. |
| **useAnalyticsData.js:25** | `Promise.all` 4 queries (orders, history, matTx, prevOrders) | read | Silent: на ошибке весь dashboard analytics показывает 0/пусто. AnalyticsPage не знает об ошибке. |
| **DashboardPage.jsx:91** (fetchData) | `Promise.all` orders+materials+activity | read | Silent: главный экран дашборда показывает «нет данных» как валидное. Не отличить пустой проект от ошибки fetch. |
| **DashboardPage.jsx:123** (fetchWorkerStats) | `Promise.all` today/week stats | read | Silent: workerStats {0, 0}. Personal stats обнуляются. Misleading для рабочего. |
| **ProductionJournalTab.jsx:122** | `await Promise.all(queries)` | read | Silent: журнал производства пуст на ошибке. |
| **useReports.js:50** (useOrdersCostReport) | `Promise.all` orders+logs | read | Silent: отчёт по себестоимости пуст на ошибке. |
| **useReports.js:87** (useBonusReport) | `Promise.all` logs+rates | read | Silent: бонусы 0. Влияет на расчёт ЗП. |
| **useReports.js:126** (useQualityReport) | `Promise.all` orders+logs | read | Silent: отчёт по качеству пуст. |
| **ClientDetailPage.jsx:18** | `Promise.all` client+orders | read | Silent: страница клиента может показать «клиент не найден» на сетевой ошибке. Misleading. |
| **AdminOrderEditor.jsx:68** | `Promise.all` clients+profiles (для dropdown'ов) | read | Silent: пустые dropdown'ы. Пользователь не сможет выбрать assignee/client. UX-проблема. |
| **MaterialConsumption.jsx:20** (loadData) | `Promise.all` materials+transactions | read | Silent: пустой выбор материалов в форме расхода. |
| **useOrders.js:151** (useProfiles) | `await query.order('display_name')` | read | Silent: пустой dropdown профилей. Используется в OrderEditForm и других местах. |

**18 fix-now точек.**

---

## DEFER-TO-BACKLOG (silent fail, но low impact или by-design)

| File:line | Operation | Class | Reason to defer |
|---|---|---|---|
| useOrders.js:160, 195, 256 | `await supabase.auth.getUser()` (3 места) | non-critical | Если getUser упадёт, `data.user` undefined → следующая проверка `if (!user) throw new Error('Not authenticated')` поймает. По факту safe, хотя и не идиоматично. |
| useOrders.js:250 | `workerProfile` select role | non-critical | Уже by-design fallback на `'post_printer'`. Не silent fail в плохом смысле. |
| useMaterials.js:78 | `await supabase.auth.getUser()` | non-critical | Same as above. |
| useMaterials.js:97 | rollback delete material_transactions | non-critical | Это ROLLBACK при upadении update_stock. Если сам rollback упадёт — всё плохо, но мы уже throw'аем оригинальную ошибку. Лог при необходимости — Phase B. |
| auth/store.js:33-37 | `onAuthStateChange` callback profile select | non-critical | Auth state changes are async background events; failure here не user-action. |
| auth/store.js:68 | `signOut()` после "Нет доступа" | non-critical | Cleanup-best-effort. |
| auth/store.js:76 | `signOut()` от signOut action | non-critical | Аналогично. Если упадёт — next reload поправит. |
| useSettings.js:74 | `await supabase.auth.getSession()` (updateUser) | non-critical | `session.access_token` используется в Authorization. Если null — fetch get 401 от api/users/update. Косвенно handled. |
| CreateUser.jsx:22 | `await supabase.auth.getSession()` | non-critical | То же. |
| ProfileCard.jsx:37 | `supabase.auth.updateUser({ password })` | already-handled | `if (error)` есть, but I wasn't sure earlier — need to verify. Actually destructures `{ error }`, throws on error → handled. Move to ALREADY-HANDLED. |
| auth/store.js:61 | profile select после signIn | semi-handled | `if (!profile) throw new Error('Нет доступа')` — domain-handled, not error-handled, но безопасно. |

**11 defer точек.**

---

## ИТОГИ

| Категория | Кол-во |
|---|---|
| ALREADY-HANDLED | ~36 |
| **FIX-NOW** | **18** |
| DEFER-TO-BACKLOG | ~11 |
| **TOTAL** | **~65 supabase await call sites** |

### Топ риски в FIX-NOW (по убыванию impact)

1. **OperationChecklist.jsx:16** — optimistic checklist toggle без error check. UI/БД рассинхрон, баг видимый юзеру.
2. **CompleteTaskModal.jsx:59 + :66** — silent material transaction insert + silent stock update. Stock drift при ошибке. Влияет на склад/себестоимость.
3. **CompleteTaskModal.jsx:48** — silent timer close. Учёт смены неточный.
4. **useProductionLogs.js:17** + return error — production logs invisible failure. Прогресс на странице заказа врёт.
5. **useShiftTracker.js:21** — shift fetch silent. Cabinet «Сегодня: 0мин» при ошибке.
6. **DashboardPage.jsx:91 + :123** — главный экран admin/manager. Все zero на ошибке.
7. **useAnalyticsData.js:25** — analytics page silent.
8. **useReports.js × 3** — все отчёты silent.
9. **ClientDetailPage:18** — silent ложно-«клиент не найден».
10. **useOrders.js:151 (useProfiles)** + AdminOrderEditor:68 + MaterialConsumption:20 — пустые dropdown'ы.
11. **ProductionJournalTab:122** — журнал silent.

### Рекомендуемая стратегия для fix-now

- **Critical (4 точки в OperationChecklist + CompleteTaskModal):** добавить `const { error } = await ...; if (error) throw error` — упадёт во внешний try/catch который уже есть. OperationChecklist — добавить try/catch если нет.
- **Read (14 точек, в основном hooks/Promise.all):** обернуть в try/catch + `setError(err)` (для хуков) или + captureError + UI fallback (для компонентов). Симметрично Phase 4.2.1 fetchFiles.
- **UI пробросы:** для хуков которые сейчас не экспортят `error` (useProductionLogs, useShiftTracker), добавить error в return — симметрично Phase 2.1.

### Backlog notes

`OperationChecklist.jsx:16` — это **самый опасный из FIX-NOW**: optimistic update без error check показывает UI чек ДО успеха в DB. Если BD/RLS отклонит — checkmark в UI остаётся, при следующем загрузке исчезнет — юзер не поймёт что произошло. Рекомендую починить первым.
