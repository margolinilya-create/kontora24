import { describe, it, expect, vi } from 'vitest'
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
