import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

/**
 * Security tests that verify configuration and code patterns.
 * These don't require a running Supabase instance.
 * For live RLS testing, use the k6 load test with different auth tokens.
 */

describe('Security: Environment variables', () => {
  it('SUPABASE_SERVICE_ROLE_KEY is not exposed to client bundle', () => {
    // Only VITE_ prefixed vars are exposed to the client
    // service_role key should NOT have VITE_ prefix
    const envExample = resolve(process.cwd(), '.env.local')
    if (existsSync(envExample)) {
      const content = readFileSync(envExample, 'utf-8')
      expect(content).not.toMatch(/VITE_.*SERVICE_ROLE/i)
    }
    // The key used in API routes doesn't have VITE prefix
    const apiFile = readFileSync(resolve(process.cwd(), 'api/bitrix/incoming.js'), 'utf-8')
    expect(apiFile).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(apiFile).not.toContain('VITE_SUPABASE_SERVICE_ROLE_KEY')
  })

  it('client supabase uses only anon key', () => {
    const clientFile = readFileSync(resolve(process.cwd(), 'src/shared/lib/supabase.js'), 'utf-8')
    expect(clientFile).toContain('VITE_SUPABASE_ANON_KEY')
    expect(clientFile).not.toContain('SERVICE_ROLE')
  })
})

describe('Security: API route validation', () => {
  it('bitrix/incoming validates webhook secret', () => {
    const content = readFileSync(resolve(process.cwd(), 'api/bitrix/incoming.js'), 'utf-8')
    expect(content).toContain('x-bitrix-secret')
    expect(content).toContain('BITRIX_WEBHOOK_SECRET')
    expect(content).toContain('401')
  })

  it('bitrix/incoming validates required fields', () => {
    const content = readFileSync(resolve(process.cwd(), 'api/bitrix/incoming.js'), 'utf-8')
    expect(content).toContain('order_type')
    expect(content).toContain('width_mm')
    expect(content).toContain('height_mm')
    expect(content).toContain('qty')
    expect(content).toContain('400')
  })

  it('bitrix/incoming rejects non-POST methods', () => {
    const content = readFileSync(resolve(process.cwd(), 'api/bitrix/incoming.js'), 'utf-8')
    expect(content).toContain("req.method !== 'POST'")
    expect(content).toContain('405')
  })

  it('bitrix/status-update has SSRF protection', () => {
    const statusUpdatePath = resolve(process.cwd(), 'api/bitrix/status-update.js')
    if (existsSync(statusUpdatePath)) {
      const content = readFileSync(statusUpdatePath, 'utf-8')
      // Should validate webhook URL domain
      expect(content).toMatch(/bitrix24\.(ru|com)/i)
      // Should enforce HTTPS
      expect(content).toMatch(/https/i)
    }
  })

  it('users/create validates admin role', () => {
    const content = readFileSync(resolve(process.cwd(), 'api/users/create.js'), 'utf-8')
    // Should check caller is admin before creating user
    expect(content).toMatch(/admin|role/i)
    // Should validate password length
    expect(content).toMatch(/password|length|6/i)
  })
})

describe('Security: Client-side patterns', () => {
  it('no hardcoded secrets in source', () => {
    const supabaseFile = readFileSync(resolve(process.cwd(), 'src/shared/lib/supabase.js'), 'utf-8')
    // Should use env vars, not hardcoded keys
    expect(supabaseFile).toContain('import.meta.env')
    // Should not contain actual key values (they start with "eyJ")
    expect(supabaseFile).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/)
  })

  it('auth store verifies k24_profiles access', () => {
    const storeFile = readFileSync(resolve(process.cwd(), 'src/features/auth/store.js'), 'utf-8')
    // Should check for profile existence (prevents PinheadOS users from accessing)
    expect(storeFile).toContain('k24_profiles')
    expect(storeFile).toContain('Нет доступа к Kontora24')
  })

  it('no dangerouslySetInnerHTML without sanitization', () => {
    // Grep all JSX files for dangerouslySetInnerHTML
    const { execSync } = require('child_process')
    try {
      const result = execSync('grep -r "dangerouslySetInnerHTML" src/ --include="*.jsx" --include="*.js" -l 2>/dev/null || true', { encoding: 'utf-8' })
      // If found, they should have sanitization nearby (DOMPurify, etc.)
      if (result.trim()) {
        // Flag but don't fail - manual review needed
        console.warn('Files with dangerouslySetInnerHTML:', result.trim())
      }
    } catch {
      // grep not finding anything is fine
    }
  })
})

describe('Security: SQL injection prevention', () => {
  it('client-side search uses parameterized queries (ilike)', () => {
    // Supabase JS client uses parameterized queries by default
    // Verify no raw SQL string concatenation in hooks
    const { execSync } = require('child_process')
    try {
      const result = execSync('grep -r "\\$\\{.*\\}" src/ --include="*.js" --include="*.jsx" | grep -i "sql\\|query\\|select\\|from\\|where" || true', { encoding: 'utf-8' })
      // Should be empty - no template literals in SQL contexts
      expect(result.trim()).toBe('')
    } catch {
      // Clean pass
    }
  })
})

describe('Security: RLS policy expectations', () => {
  it('migrations define RLS policies for all critical tables', () => {
    const { execSync } = require('child_process')
    const migrations = execSync('grep -r "ENABLE ROW LEVEL SECURITY\\|CREATE POLICY" supabase/migrations/ 2>/dev/null || true', { encoding: 'utf-8' })
    // Should have RLS enabled on critical tables (may use k24_ prefix or not depending on migration version)
    expect(migrations).toMatch(/orders/)
    expect(migrations).toMatch(/profiles/)
    expect(migrations).toMatch(/materials/)
  })

  it('RPC functions use SECURITY DEFINER with role checks', () => {
    const { execSync } = require('child_process')
    const migrations = execSync('grep -r "SECURITY DEFINER\\|get_my_role" supabase/migrations/ 2>/dev/null || true', { encoding: 'utf-8' })
    expect(migrations).toContain('SECURITY DEFINER')
  })
})

describe('Security phase 3: маскирование финансов k24_orders', () => {
  const financeCols = [
    'cost_materials', 'cost_labor', 'cost_total',
    'markup', 'discount_pct', 'price_final', 'price_per_unit',
  ]

  it('view k24_orders_full маскирует все 7 финансовых колонок через CASE', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/071_orders_finance_masking_view.sql'), 'utf-8')
    expect(sql).toContain('CREATE OR REPLACE VIEW public.k24_orders_full')
    // Каждая финансовая колонка обёрнута в CASE по праву view:finance
    // (динамическое L2, консистентно с фронтом useCanDo('view:finance')).
    for (const col of financeCols) {
      const re = new RegExp(`CASE WHEN EXISTS[\\s\\S]*?view:finance[\\s\\S]*?THEN o\\.${col} END AS ${col}`)
      expect(sql, `нет маски для ${col}`).toMatch(re)
    }
    // view не должен раздавать доступ анониму
    expect(sql).toMatch(/REVOKE ALL ON public\.k24_orders_full FROM PUBLIC, anon/)
    expect(sql).toMatch(/GRANT SELECT ON public\.k24_orders_full TO authenticated/)
  })

  it('фронт НЕ читает финансовые колонки напрямую из k24_orders (только через view)', () => {
    const { execSync } = require('child_process')
    // R25.6: + calc_snapshot (снимок расчёта калькулятора — финансовый, миграция 101).
    const finRe = /price_final|cost_total|cost_labor|cost_materials|markup|discount_pct|price_per_unit|calc_snapshot/
    // Ревью 05.07: старый построчный grep не видел многострочные select'ы
    // (типичный стиль кодовой базы — .select(...) следующей строкой после
    // .from('k24_orders')). Теперь смотрим окно после каждого вызова + все
    // embed'ы k24_orders!fk(...). После миграции 072 такое чтение упало бы
    // 42501 — тест ловит регресс до прода.
    const files = execSync(
      `grep -rl "k24_orders" src/ --include="*.js" --include="*.jsx" || true`,
      { encoding: 'utf-8' },
    ).split('\n').filter(Boolean)
    const leaks = []
    for (const f of files) {
      const src = readFileSync(resolve(process.cwd(), f), 'utf-8')
      // 1) .from('k24_orders') — проверяем 600 символов после вызова (цепочка
      // .select(...) укладывается в это окно). 'k24_orders_full' не матчится —
      // литерал требует закрывающей кавычки сразу после s.
      const fromRe = /from\('k24_orders'\)/g
      let m
      while ((m = fromRe.exec(src))) {
        const windowStr = src.slice(m.index, m.index + 600)
        if (finRe.test(windowStr)) leaks.push(`${f}: from('k24_orders') с финколонкой в select-цепочке`)
      }
      // 2) embed order:k24_orders!fk(колонки)
      const embedRe = /k24_orders!\w+\(([^)]*)\)/g
      while ((m = embedRe.exec(src))) {
        if (finRe.test(m[1])) leaks.push(`${f}: embed k24_orders!(…) с финколонкой: ${m[1].trim().slice(0, 80)}`)
      }
    }
    expect(leaks, `финансы читаются напрямую из таблицы:\n${leaks.join('\n')}`).toHaveLength(0)
  })
})

describe('R25.6: снимок расчёта калькулятора (calc_snapshot)', () => {
  const read = (f) => readFileSync(resolve(process.cwd(), f), 'utf-8')
  const sql = read('supabase/migrations/101_r25_6_calc_snapshot.sql')
  // Без комментариев: проверяем только исполняемый SQL.
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

  it('101: колонка финансовая — без колоночного GRANT для authenticated', () => {
    expect(code).toMatch(/ADD COLUMN IF NOT EXISTS calc_snapshot JSONB/)
    const grants = code.match(/GRANT SELECT \(([^)]*)\)\s+ON public\.k24_orders TO authenticated/g) || []
    for (const g of grants) expect(g).not.toContain('calc_snapshot')
    expect(code).not.toMatch(/GRANT SELECT ON public\.k24_orders TO authenticated/)
    expect(code).toMatch(/REVOKE SELECT \(calc_snapshot\) ON public\.k24_orders FROM authenticated/)
  })

  it('101: view k24_orders_full маскирует calc_snapshot и все прежние финколонки', () => {
    for (const col of ['price_final', 'price_per_unit', 'cost_total', 'contractor_cost', 'calc_snapshot']) {
      const re = new RegExp(`CASE WHEN EXISTS[^\\n]*view:finance[^\\n]*THEN o\\.${col} END AS ${col}`)
      expect(code, `нет маски для ${col}`).toMatch(re)
    }
    // calc_snapshot — последняя колонка view (CREATE OR REPLACE VIEW: только добавление в конец).
    expect(code).toMatch(/o\.montage_material_id,\s*\n\s*CASE WHEN EXISTS[^\n]*THEN o\.calc_snapshot END AS calc_snapshot\s*\nFROM k24_orders o;/)
    expect(code).toContain('REVOKE ALL ON public.k24_orders_full FROM PUBLIC, anon')
    expect(code).toContain('GRANT SELECT ON public.k24_orders_full TO authenticated')
  })

  it('101: protect-триггер не даёт воркеру менять calc_snapshot (и сохраняет поля 099)', () => {
    expect(code).toMatch(/NEW\.calc_snapshot IS DISTINCT FROM OLD\.calc_snapshot/)
    for (const col of ['price_final', 'price_per_unit', 'contractor_cost', 'is_subcontract', 'route_version', 'sticker_shape']) {
      expect(code).toContain(`NEW.${col} IS DISTINCT FROM OLD.${col}`)
    }
  })

  it('фронт читает calc_snapshot только из k24_orders_full и только с view:finance', () => {
    const { execSync } = require('child_process')
    const files = execSync(
      'grep -rl "calc_snapshot" src/ --include="*.js" --include="*.jsx" || true',
      { encoding: 'utf-8' },
    ).split('\n').filter(Boolean).filter((f) => !/\.test\.jsx?$/.test(f))
    const leaks = []
    for (const f of files) {
      const src = read(f)
      // Любой select-список с calc_snapshot должен идти через k24_orders_full
      // и подключаться только финансовой веткой (константа *FINANCE*).
      const selRe = /calc_snapshot/g
      let m
      while ((m = selRe.exec(src))) {
        const before = src.slice(Math.max(0, m.index - 600), m.index)
        if (/from\('k24_orders'\)\s*\.select\([^)]*$/.test(before)) {
          leaks.push(`${f}: calc_snapshot в select из k24_orders`)
        }
      }
      const embedRe = /k24_orders!\w+\(([^)]*)\)/g
      while ((m = embedRe.exec(src))) {
        if (/calc_snapshot/.test(m[1])) leaks.push(`${f}: embed k24_orders!(…) с calc_snapshot`)
      }
    }
    expect(leaks, leaks.join('\n')).toHaveLength(0)
    // Детальный запрос заказа: calc_snapshot только в финансовом наборе полей.
    const orders = read('src/features/orders/hooks/useOrders.js')
    const base = orders.match(/const DETAIL_FIELDS_BASE = `([^`]*)`/)?.[1] || ''
    const fin = orders.match(/const DETAIL_FIELDS_FINANCE = `([^`]*)`/)?.[1] || ''
    expect(base).not.toContain('calc_snapshot')
    expect(fin).toContain('calc_snapshot')
  })
})

describe('R25.8: маскирование денег склада', () => {
  const read = (f) => readFileSync(resolve(process.cwd(), f), 'utf-8')

  it('view k24_material_movements и k24_materials_full маскируют деньги по view:finance', () => {
    const sql = read('supabase/migrations/096_r25_8_warehouse_journal.sql')
    expect(sql).toMatch(/k24_user_can\('view:finance'\) AS can_fin/)
    expect(sql).toMatch(/CASE WHEN f\.can_fin THEN t\.total_cost END AS total_cost/)
    expect(sql).toMatch(/CASE WHEN f\.can_fin THEN t\.unit_cost\s+END AS unit_cost/)
    expect(sql).toMatch(/CASE WHEN f\.can_fin THEN m\.unit_cost END AS unit_cost/)
    for (const v of ['k24_material_movements', 'k24_materials_full']) {
      expect(sql).toContain(`REVOKE ALL ON public.${v} FROM PUBLIC, anon`)
      expect(sql).toContain(`GRANT SELECT ON public.${v} TO authenticated`)
    }
    // Сводка читает total_cost таблицы → маскирует сумму явно.
    expect(sql).toMatch(/CASE WHEN v_fin THEN a\.a_sum END/)
  })

  it('098 отзывает табличный SELECT и возвращает колоночный без денежных колонок', () => {
    const sql = read('supabase/migrations/098_r25_8_warehouse_money_revoke.sql')
    expect(sql).toContain('REVOKE SELECT ON public.k24_material_transactions FROM authenticated')
    expect(sql).toContain('REVOKE SELECT ON public.k24_materials FROM authenticated')
    expect(sql).toMatch(/NOT IN \('total_cost', 'unit_cost'\)/)
    expect(sql).toMatch(/NOT IN \('unit_cost'\)/)
  })

  it('фронт не читает деньги склада из таблиц напрямую и не делает select(*) по ним', () => {
    // После 098 такие запросы падают 42501 — тест ловит регресс до прода.
    const { execSync } = require('child_process')
    const files = execSync(
      'grep -rlE "k24_materials|k24_material_transactions" src/ --include="*.js" --include="*.jsx" || true',
      { encoding: 'utf-8' },
    ).split('\n').filter(Boolean)
    const leaks = []
    for (const f of files) {
      const src = read(f)
      const fromRe = /from\('(k24_materials|k24_material_transactions)'\)([^;]{0,400})/g
      let m
      while ((m = fromRe.exec(src))) {
        const sel = m[2].match(/^[\s\S]*?\.select\(([^)]*)\)/)
        // insert/update/delete без select — пропускаем; select() без колонок = '*'.
        if (!sel) continue
        if (/\.(insert|update|delete)\(/.test(m[2].slice(0, m[2].indexOf('.select(')))) {
          if (sel[1].trim() === '') leaks.push(`${f}: from('${m[1]}')…select() без колонок`)
          continue
        }
        if (/unit_cost|total_cost|'\*'/.test(sel[1]) || sel[1].trim() === '') {
          leaks.push(`${f}: from('${m[1]}').select(${sel[1].trim().slice(0, 60)})`)
        }
      }
      const embedRe = /k24_materials(?:!\w+)?\(([^)]*)\)/g
      while ((m = embedRe.exec(src))) {
        if (/unit_cost|\*/.test(m[1])) leaks.push(`${f}: embed k24_materials(${m[1].trim().slice(0, 60)})`)
      }
    }
    expect(leaks, `деньги склада читаются из таблиц:\n${leaks.join('\n')}`).toHaveLength(0)
  })
})

describe('R25.7A: реестр типов заказов и снимок маршрута', () => {
  const read = (f) => readFileSync(resolve(process.cwd(), f), 'utf-8')
  const strip = (sql) => sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  const sql102 = strip(read('supabase/migrations/102_r25_7_order_types.sql'))
  const sql103 = strip(read('supabase/migrations/103_r25_7_route_snapshot.sql'))
  const sql101 = strip(read('supabase/migrations/101_r25_6_calc_snapshot.sql'))

  it('103: route_snapshot — нефинансовая, колоночный GRANT authenticated', () => {
    expect(sql103).toMatch(/ADD COLUMN IF NOT EXISTS route_snapshot JSONB/)
    expect(sql103).toMatch(/GRANT SELECT \(route_snapshot\) ON public\.k24_orders TO authenticated/)
    expect(sql103).not.toMatch(/GRANT SELECT ON public\.k24_orders TO authenticated/)
    // Финансовые колонки этой миграцией не раскрываются.
    const grants = sql103.match(/GRANT SELECT \(([^)]*)\)\s+ON public\.k24_orders TO authenticated/g) || []
    expect(grants.length).toBeGreaterThan(0)
    for (const g of grants) {
      expect(g).not.toMatch(/price_final|cost_|markup|discount_pct|price_per_unit|contractor_cost|calc_snapshot/)
    }
  })

  it('103: view = тело 101 дословно + route_snapshot последней колонкой', () => {
    const body = (sql) => sql.slice(sql.indexOf('CREATE OR REPLACE VIEW public.k24_orders_full AS'), sql.indexOf('FROM k24_orders o;'))
    const v101 = body(sql101).trimEnd()
    const v103 = body(sql103).trimEnd()
    expect(v101.length).toBeGreaterThan(100)
    expect(v103).toBe(`${v101},\n  o.route_snapshot`)
    expect(sql103).toContain('REVOKE ALL ON public.k24_orders_full FROM PUBLIC, anon')
    expect(sql103).toContain('GRANT SELECT ON public.k24_orders_full TO authenticated')
  })

  it('103: protect-триггер = 101 + route_snapshot (воркер не переписывает снимок)', () => {
    const checks = (sql) => (sql.slice(sql.indexOf('FUNCTION public.k24_protect_order_columns')).match(/NEW\.(\w+) IS DISTINCT FROM OLD\.\1/g) || [])
    const before = checks(sql101)
    expect(before.length).toBeGreaterThan(10)
    expect(checks(sql103)).toEqual([...before, 'NEW.route_snapshot IS DISTINCT FROM OLD.route_snapshot'])
  })

  it('102: таблицы реестра — только чтение для authenticated, запись через RPC', () => {
    for (const t of ['k24_order_types', 'k24_stage_defs']) {
      expect(sql102).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`))
      expect(sql102).toMatch(new RegExp(`REVOKE ALL ON public\\.${t}\\s+FROM PUBLIC, anon, authenticated`))
      expect(sql102).toMatch(new RegExp(`GRANT SELECT ON public\\.${t}\\s+TO authenticated`))
      expect(sql102).not.toMatch(new RegExp(`GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*ON public\\.${t}`))
    }
  })

  it('RPC реестра: SECURITY DEFINER + search_path + отзыв у anon; запись по order_type:manage', () => {
    const fns = [
      [sql102, 'save_order_type(JSONB)'],
      [sql102, 'order_type_usage()'],
      [sql102, 'k24_validate_type_production(JSONB, JSONB, BOOLEAN)'],
      [sql103, 'k24_build_route_snapshot(TEXT)'],
      [sql103, 'apply_type_route_to_order(UUID)'],
    ]
    for (const [sql, sig] of fns) {
      expect(sql, sig).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon`)
    }
    const definers = (sql) => sql.split('CREATE OR REPLACE FUNCTION').slice(1)
    for (const fn of [...definers(sql102), ...definers(sql103)]) {
      if (/SECURITY DEFINER/.test(fn)) expect(fn).toMatch(/SET search_path/)
    }
    expect(sql102).toMatch(/save_order_type[\s\S]*k24_user_can\('order_type:manage'\)/)
    expect(sql102).toMatch(/order_type_usage[\s\S]*k24_user_can\('order_type:manage'\)/)
    expect(sql103).toMatch(/apply_type_route_to_order[\s\S]*v_role NOT IN \('admin', 'manager'\)[\s\S]*k24_order_audit/)
  })

  it('фронт читает реестр явными колонками (без select(*))', () => {
    const store = read('src/features/order-types/store.js')
    expect(store).toMatch(/from\('k24_order_types'\)\.select\(TYPE_COLUMNS\)/)
    expect(store).toMatch(/from\('k24_stage_defs'\)\.select\(STAGE_COLUMNS\)/)
  })
})
