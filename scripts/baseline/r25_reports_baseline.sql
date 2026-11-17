-- R25.0 — эталон отчётов «Сдельная оплата», «Качество», «3D отдел» + склад.
-- ТОЛЬКО SELECT. Результат — одна строка с одним jsonb-столбцом `baseline`.
--
-- Окно: 2026-05-01 .. min(2026-11-30 конец дня, cutoff). cutoff зафиксирован
-- на момент снятия эталона (2026-11-17 00:00 UTC), чтобы новые логи после
-- снятия не давали ложных расхождений. При пересъёме эталона после 30.11 —
-- поднять cutoff до '2026-12-01' и пересохранить r25-baseline.json.
--
-- Правила оплаты (как calculateWorkerPayout / computeLogPayout):
--   заливка   = stickers_good на pouring|selection_pouring × ставка формы
--   выборка   = qty_selected на selection_pouring (×spp) | selection (×spp для stickerpack3D, иначе ×1)
--   сборка 3D = packs_assembled на assembly_3d × spp
--   упаковка  = packs_packaged на packaging
-- spp = stickers_per_pack заказа (NULL/0 → 1). Форма заливки:
--   pack_designs.shape_type (≠standard) по design_index → orders.sticker_shape (≠standard) → standard.
WITH params AS (
  SELECT timestamptz '2026-05-01 00:00:00+00' AS from_ts,
         LEAST(timestamptz '2026-12-01 00:00:00+00', timestamptz '2026-11-17 00:00:00+00') AS to_ts
),
rates AS (
  SELECT COALESCE((value->>'pouring')::numeric, 1)      AS pouring,
         COALESCE((value->>'selection')::numeric, 0.5)  AS selection,
         COALESCE((value->>'assembly_3d')::numeric, 0.5) AS assembly,
         COALESCE((value->>'packaging')::numeric, 1.5)  AS packaging,
         COALESCE(value->'pouring_shapes', '{"standard":1,"complex":1.5,"big":1.5,"complex_big":2}'::jsonb) AS shapes
  FROM (SELECT (SELECT value FROM k24_settings WHERE key = 'bonus_rates') AS value) s
),
logs AS (
  SELECT l.*, o.order_type,
         COALESCE(NULLIF(o.stickers_per_pack, 0), 1) AS spp,
         COALESCE(
           (SELECT d.shape_type FROM k24_pack_designs d
             WHERE d.order_id = l.order_id AND d.design_index = l.design_index
               AND d.shape_type <> 'standard' LIMIT 1),
           NULLIF(o.sticker_shape, 'standard'),
           'standard') AS shape
  FROM k24_production_logs l
  JOIN k24_orders o ON o.id = l.order_id, params p
  WHERE l.deleted_at IS NULL AND l.created_at >= p.from_ts AND l.created_at < p.to_ts
),
pay AS (
  SELECT lg.worker_id, lg.stage, lg.order_type, lg.shape,
    CASE WHEN lg.stage IN ('pouring','selection_pouring') THEN COALESCE(lg.stickers_good,0) ELSE 0 END AS poured_good,
    CASE WHEN lg.stage IN ('selection_pouring','selection') THEN COALESCE(lg.qty_selected,0) ELSE 0 END AS selected,
    CASE WHEN lg.stage = 'selection_pouring' OR (lg.stage = 'selection' AND lg.order_type = 'stickerpack3D')
         THEN COALESCE(lg.qty_selected,0) * lg.spp
         WHEN lg.stage = 'selection' THEN COALESCE(lg.qty_selected,0) ELSE 0 END AS selected_stickers,
    CASE WHEN lg.stage = 'assembly_3d' THEN COALESCE(lg.packs_assembled,0) ELSE 0 END AS assembled_packs,
    CASE WHEN lg.stage = 'assembly_3d' THEN COALESCE(lg.packs_assembled,0) * lg.spp ELSE 0 END AS assembled_stickers,
    CASE WHEN lg.stage = 'packaging' THEN COALESCE(lg.packs_packaged,0) ELSE 0 END AS packaged
  FROM logs lg
),
pay_amount AS (
  SELECT pa.*,
    pa.poured_good * COALESCE((r.shapes->>pa.shape)::numeric, r.pouring)
      + pa.selected_stickers * r.selection
      + pa.assembled_stickers * r.assembly
      + pa.packaged * r.packaging AS amount
  FROM pay pa, rates r
)
SELECT jsonb_build_object(
  'meta', (SELECT jsonb_build_object('from', from_ts, 'to', to_ts) FROM params),
  'rates', (SELECT to_jsonb(r) FROM rates r),

  -- Оплата: входы по сотруднику × этапу × типу заказа × форме.
  'payout_inputs', (SELECT COALESCE(jsonb_agg(x ORDER BY x.worker_id, x.stage, x.order_type, x.shape), '[]') FROM (
      SELECT worker_id, stage, order_type, shape, count(*) AS logs,
             sum(poured_good) AS poured_good, sum(selected) AS selected,
             sum(selected_stickers) AS selected_stickers, sum(assembled_packs) AS assembled_packs,
             sum(assembled_stickers) AS assembled_stickers, sum(packaged) AS packaged,
             round(sum(amount), 2) AS amount
      FROM pay_amount GROUP BY 1,2,3,4
      HAVING sum(poured_good)+sum(selected)+sum(assembled_packs)+sum(packaged) <> 0) x),

  -- Итог «Сдельной оплаты» по сотруднику (₽).
  'payout_by_worker', (SELECT COALESCE(jsonb_object_agg(worker_id, amt), '{}') FROM (
      SELECT worker_id, round(sum(amount), 2) AS amt FROM pay_amount GROUP BY 1) x),

  -- Контроль «квирков» отчётов: поля оплаты вне канонических этапов
  -- (useBonusReport/useEmployeeReport до R25.0 платили по полю без этапа).
  -- Если всё 0 — переход на стадийную модель не меняет цифры.
  'quirk_fields_off_stage', (SELECT jsonb_build_object(
      'stickers_good',   sum(COALESCE(stickers_good,0))   FILTER (WHERE stage NOT IN ('pouring','selection_pouring')),
      'qty_selected',    sum(COALESCE(qty_selected,0))    FILTER (WHERE stage NOT IN ('selection_pouring','selection')),
      'packs_assembled', sum(COALESCE(packs_assembled,0)) FILTER (WHERE stage <> 'assembly_3d'),
      'packs_packaged',  sum(COALESCE(packs_packaged,0))  FILTER (WHERE stage <> 'packaging')) FROM logs),

  -- «Качество» + брак по этапам.
  'by_stage', (SELECT COALESCE(jsonb_object_agg(stage, x), '{}') FROM (
      SELECT stage, jsonb_build_object(
        'logs', count(*),
        'defects', sum(COALESCE(defects,0)),
        'stickers_printed', sum(COALESCE(stickers_printed,0)),
        'stickers_poured', sum(COALESCE(stickers_poured,0)),
        'stickers_good', sum(COALESCE(stickers_good,0))) AS x
      FROM logs GROUP BY stage) s),

  -- «3D отдел»: stickerpack3D-заказы окна, по виду (track=stickers).
  'three_d', (SELECT COALESCE(jsonb_agg(x ORDER BY x.number, x.design_index), '[]') FROM (
      SELECT o.number, o.status, d.design_index, o.qty,
        (SELECT COALESCE(sum(l.stickers_printed),0) FROM logs l WHERE l.order_id=o.id AND l.design_index=d.design_index AND l.track='stickers' AND l.stage='print') AS printed,
        (SELECT COALESCE(sum(l.stickers_good),0) FROM logs l WHERE l.order_id=o.id AND l.design_index=d.design_index AND l.track='stickers' AND l.stage IN ('pouring','selection_pouring')) AS good,
        (SELECT COALESCE(sum(l.defects),0) FROM logs l WHERE l.order_id=o.id AND l.design_index=d.design_index AND l.track='stickers' AND l.stage IN ('pouring','selection_pouring','drying')) AS defects
      FROM k24_orders o JOIN k24_pack_designs d ON d.order_id = o.id, params p
      WHERE o.order_type = 'stickerpack3D' AND o.created_at >= p.from_ts AND o.created_at < p.to_ts) x),

  -- Склад: сумма операций за окно + остаток на cutoff (stock_qty минус дельты после cutoff).
  'materials', (SELECT COALESCE(jsonb_object_agg(m.id, jsonb_build_object(
        'delta_window', COALESCE((SELECT sum(t.delta) FROM k24_material_transactions t, params p
                                   WHERE t.material_id = m.id AND t.created_at >= p.from_ts AND t.created_at < p.to_ts), 0),
        'stock_at_cutoff', m.stock_qty - COALESCE((SELECT sum(t.delta) FROM k24_material_transactions t, params p
                                   WHERE t.material_id = m.id AND t.created_at >= p.to_ts), 0))), '{}')
      FROM k24_materials m)
) AS baseline;
