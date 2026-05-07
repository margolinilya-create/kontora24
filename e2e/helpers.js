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

/**
 * Открыть мобильный sidebar если он скрыт.
 * На <768px sidebar по умолчанию closed; кнопка-burger «Меню» в шапке.
 */
export async function ensureSidebarOpen(page) {
  const viewport = page.viewportSize()
  if (!viewport || viewport.width >= 768) return // на desktop sidebar постоянно виден
  const sidebar = page.locator('aside')
  const visible = await sidebar.isVisible({ timeout: 500 }).catch(() => false)
  if (visible) return
  await page.getByRole('button', { name: 'Меню' }).click()
  await page.waitForTimeout(300)
}

/**
 * Раскрыть сворачиваемую группу в сайдбаре по её заголовку (uppercase).
 * Sidebar groups: "Управление", "Производство", "Ресурсы", "Система".
 */
export async function expandSidebarGroup(page, groupLabel) {
  await ensureSidebarOpen(page)
  const btn = page.locator('aside button', { hasText: groupLabel.toUpperCase() })
  if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await btn.click()
    await page.waitForTimeout(200)
  }
}

/**
 * Переключить admin'а в эмуляцию другой роли.
 * RoleSwitcher dropdown содержит группы вида:
 *   <p>Печатник</p>            — заголовок роли (uppercase)
 *   <button>имя пользователя</button> — список users этой роли
 *   ...
 * Кликаем первого пользователя в группе с указанным label.
 */
export async function emulateRole(page, roleLabel) {
  await ensureSidebarOpen(page)
  const switchBtn = page.locator('button[aria-label="Войти как пользователь"]')
  await switchBtn.click()
  await page.waitForTimeout(400)

  // Находим заголовок группы (с учётом uppercase в CSS — text сравнивается до transform)
  const header = page.locator('p').filter({ hasText: new RegExp(`^${roleLabel}$`, 'i') }).first()
  await header.waitFor({ timeout: 3000 })
  // Следующая кнопка после заголовка — первый user этой роли
  const firstUser = header.locator('xpath=following-sibling::button[1]')
  await firstUser.click()
  await page.waitForTimeout(500)
}
