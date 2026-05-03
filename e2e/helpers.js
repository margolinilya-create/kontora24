// E2E test helpers for Kontora24

/**
 * Login to the application
 */
export async function login(page, email = 'mib@pnhd.ru', password = 'Kontora24!') {
  await page.goto('/login')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL('/', { timeout: 20000 })
}

/**
 * Wait for a toast notification with given text
 */
export async function waitForToast(page, text) {
  const toast = page.locator('[role="alert"], [data-toast]').filter({ hasText: text })
  await toast.waitFor({ timeout: 5000 })
  return toast
}

/**
 * Navigate to a page and ensure it loaded
 */
export async function navigateTo(page, path) {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
}

/**
 * Get the current order count in a production board column
 */
export async function getColumnCount(page, statusLabel) {
  const column = page.locator(`[data-status]`).filter({ hasText: statusLabel })
  const cards = column.locator('[data-order-card]')
  return await cards.count()
}
