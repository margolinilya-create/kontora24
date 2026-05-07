import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Authentication', () => {
  test('login page shows form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /войти/i })).toBeVisible()
  })

  test('successful login redirects to dashboard', async ({ page }) => {
    await login(page)
    await expect(page).toHaveURL('/')
    await expect(page.locator('main')).toBeVisible()
  })

  test('wrong password shows error', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', 'mib@pnhd.ru')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.getByRole('button', { name: /войти/i }).click()
    // Error appears as toast or inline message
    await expect(
      page.locator('[role="alert"], [data-toast], [class*="error"], [class*="toast"]').first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('unauthenticated user redirected to login', async ({ page }) => {
    await page.goto('/orders')
    await expect(page).toHaveURL(/\/login/)
  })

  test('logout clears session', async ({ page }) => {
    await login(page)
    await expect(page).toHaveURL('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Click "Выйти" in sidebar
    const sidebar = page.locator('aside')
    await sidebar.getByText('Выйти').click()
    // Confirm dialog appears — click red "Выйти" button inside the dialog
    const dialog = page.locator('[role="dialog"], [class*="modal"], div.fixed')
    await dialog.getByRole('button', { name: /выйти/i }).click()
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })

  test('admin sees full sidebar navigation', async ({ page }) => {
    await login(page)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const sidebar = page.locator('aside')
    await expect(sidebar.getByRole('link', { name: 'Заказы' })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'Главная' })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'Аналитика' })).toBeVisible()
    await expect(sidebar.getByText('Выйти')).toBeVisible()
  })

  test('protected pages return to login with redirect', async ({ page }) => {
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/login/)
  })
})
