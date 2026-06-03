# Production Planner — карта переменных

Модуль реализует требования из ТЗ менеджера (Google Doc 1bcAZt6G…, бриф
2026-06-03). ТЗ написан в «теоретических» именах; реальная схема
Kontora24 использует другие имена/таблицы/маршруты. Эта карта — мостик.

При написании нового кода **всегда** используйте имена из колонки
«Kontora24». Имена из ТЗ остаются только как ссылки на разделы документа.

## Поля заказа

| ТЗ                    | Kontora24                                                | Где живёт                                              |
| --------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| `orders.id` (K-1042)  | `k24_orders.id` UUID + `number` int + `custom_number`    | `formatOrderNumber()` из `src/shared/lib/utils.js`     |
| `type`                | `order_type` (sticker_cut, sticker_kiss, stickerpack, rect, big, sticker3D, stickerpack3D) | `ORDER_TYPES` из `src/shared/constants.js`             |
| `kinds`               | `design_variants` int + строки `k24_order_items`         | `useOrderItems`                                         |
| `per_pack`            | `stickers_per_pack` int                                  |                                                         |
| `lamination: bool`    | `need_lam: bool` + `lam_type` (matte/glossy/transfer/null) | `needsLamination()` из `src/shared/constants.js`      |
| `design_provided`     | `design_status === 'provided'`                           |                                                         |
| `rush: bool`          | `priority === 'urgent'` либо `is_urgent === true`        |                                                         |
| `customer / budget`   | `client_id` + `price_final`                              |                                                         |
| `order_stage_logs`    | `k24_production_logs` (`deleted_at` soft-delete)          | `STAGE_FIELDS`, `computeStageProgress` из `production-logs.js` |
| `production_settings` | `k24_settings (key, value jsonb)`                         | `useSettings(key)`                                      |
| `plan_overrides`      | `k24_plan_overrides`                                      | миграция 048                                            |
| `employees(id)`       | `k24_profiles(id)`                                        |                                                         |

## Этапы маршрута (ТЗ §5.1 vs реальный код)

ТЗ упрощает маршруты — у нас в проекте R11 добавил sample workflow и
новые 3D-этапы. Планировщик **обязан** работать по реальному
`getOrderRoute(order)` из `src/shared/constants.js`.

| ТЗ            | Kontora24 (один или два этапа)              | Бакет           |
| ------------- | ------------------------------------------- | --------------- |
| `verstka`     | `sample_layout` + `batch_layout`            | `prepress`      |
| `samplePrint` | `sample_print`                              | `oprl_print`    |
| `colorApprove`| `color_approval` (веха-пауза, ждём клиента) | `milestone`     |
| `cut`         | `cutting`                                   | `oprl_cut`      |
| `packing`     | `packaging`                                 | `post_print`    |
| `weeding`     | `selection_pouring` track='backgrounds' и/или `selection` (sticker3D) | `post_print` |
| `resin`       | `pouring` (sticker3D) и `selection_pouring` track='stickers' (stickerpack3D) | `post_print` |
| `assembly3D`  | `assembly_3d`                               | `post_print`    |
| —             | `extra_stickers` (R11.3 подзадачи)          | не в MVP        |

## Бакеты ёмкости

ТЗ §6.3 делит на 6 бакетов с раздельными 3DО (1 заливщик) и ОСК (2 чел).
По решению пользователя (бриф 03.06): пост-печатная бригада 3 человека
делает всё одновременно, поэтому у нас единый бакет `post_print`
(24 ч/день). Полная карта в [buckets.js](./buckets.js).

| Бакет        | Стадии                                                            | Дефолт штата | Ч/день |
| ------------ | ----------------------------------------------------------------- | ------------ | ------ |
| `design`     | `design`                                                          | 1 дизайнер   | 8      |
| `prepress`   | `prepress`, `sample_layout`, `batch_layout`                       | 1 препресс   | 8      |
| `oprl_print` | `print`, `sample_print`, `lamination`                             | 1 печатник   | 8      |
| `oprl_cut`   | `cutting`                                                         | 2 плоттера   | 16     |
| `post_print` | `pouring`, `selection_pouring`, `selection`, `assembly_3d`, `packaging`, `otk` | 3 чел.       | 24     |
| `passive`    | `drying`                                                          | —            | пассив 36ч → 2 раб. дня |
| `milestone`  | `new`, `color_approval`, `done`, `cancelled`                      | —            | не планируется |

## Хранение настроек

| Ключ `k24_settings`        | Содержимое                                          |
| -------------------------- | --------------------------------------------------- |
| `planning:norms`           | Нормативы длительности (см. `DEFAULT_NORMS`)        |
| `planning:capacity`        | Кол-во ресурсов на бакет (см. `DEFAULT_CAPACITY`)   |
| `planning:holidays_2026`   | Массив `YYYY-MM-DD` госпраздников РФ                |

Дефолты живут в [norms.js](./norms.js); миграция 048 кладёт их в БД при
первом применении (`ON CONFLICT DO NOTHING`).

## Чистые функции

- [`buckets.js`](./buckets.js) — `STAGE_TO_BUCKET`, `BUCKET_LABELS`, `VISIBLE_BUCKETS`
- [`norms.js`](./norms.js) — `DEFAULT_NORMS`, `DEFAULT_CAPACITY`, `resolveNorms`, `bucketHoursPerDay`
- [`working-days.js`](./working-days.js) — пн–пт + праздники; `addWorkingDays`, `previousWorkingDay`, `getWorkingDays`
- [`planner.js`](./planner.js) — `computeOrderVolumes` (§6.1 ТЗ, переиспользует `material-forecast.js`), `getStageDurationHours` (§6.2), `getActiveStages` (§7.2), `schedule` (§7 целиком)

Все функции — pure JS без React и Supabase. Покрытие: 68 unit-тестов
в `*.test.js`.

## Что упрощено в MVP (явно)

- **dual-track stickerpack3D**: считаем один общий объём, не разделяем
  на параллельные чипы «фоны/стикеры». Это даёт корректную оценку
  загрузки бакета (треки делят ресурс), но визуально не показывает
  деление.
- **multi-variant**: `production_logs.item_idx` для прогресса не
  используется — менеджер двигает variant-subtasks вручную.
- **extra_stickers подзадачи**: не планируются в MVP.
- **Edge Function для серверного расчёта**: не делаем (YAGNI, 50-100
  заказов считаются на клиенте за единицы мс).
