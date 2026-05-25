// E2E test helpers for Kontora24
//
// Layout мунтит ДВА <aside>: desktop в `hidden md:block` контейнере
// (на мобилке остаётся в DOM, но `display:none`) и mobile overlay при
// `mobileOpen=true`. Без фильтра по видимости любой `page.locator('aside')`
// упирается в strict mode violation. Везде ниже работаем через `visibleSidebar()`.

/**
 * Видимый <aside> — на desktop единственный, на mobile это overlay-копия.
 * Использует Playwright extension-pseudo `:visible`.
 */
export function visibleSidebar(page) {
  return page.locator('aside:visible')
}

/**
 * Login to the application. После URL-смены ждём появления <main>:
 * URL может моргнуть в `/` ещё до того, как auth state стабилизирован,
 * и тест тут же ловит редирект обратно на /login.
 */
export async function login(page, email = 'mib@pnhd.ru', password = 'Kontora24!') {
  await page.goto('/login')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL('/', { timeout: 20000 })
  await page.waitForSelector('main', { timeout: 10000 })
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
 * Закрыть ShiftReminderModal («Начать смену?») если он открыт.
 * Модал автоматически показывается воркерам (printer/post_printer) при логине,
 * блокирует все клики backdrop'ом. Тесты, которые не про смены, должны
 * избавиться от модала перед другими действиями.
 *
 * Identifies shift-modal specifically by заголовок «Начать смену?» — чтобы не
 * закрыть случайно другие модалы. Использует force: true (анимация Modal
 * мешает stable-check). Idempotent — если не найдено, тихо выходит.
 */
export async function dismissShiftModal(page) {
  const shiftTitle = page.getByText('Начать смену?', { exact: true })
  if (!(await shiftTitle.isVisible({ timeout: 300 }).catch(() => false))) return

  // Ищем «Отмена» внутри dialog, чтобы не зацепить кнопку из другого места
  const cancelBtn = page.getByRole('dialog').getByRole('button', { name: 'Отмена' }).first()
  await cancelBtn.click({ force: true, timeout: 3000 }).catch(() => {})
  // Backdrop Modal — `.bg-black/40` (Tailwind escape: `\\/40`)
  await page.locator('.bg-black\\/40').waitFor({ state: 'hidden', timeout: 2000 }).catch(() => {})
}

/**
 * Кликнуть view-таб («По отделам» / «Канбан» / «Календарь» / «Все заказы»).
 * На desktop таб через role="tab", на mobile через DropdownMenu (button →
 * role="option"). Локаторы выбираются по видимости — не работающие на текущем
 * viewport автоматически отсекаются `:visible`.
 */
export async function clickViewTab(page, name) {
  const desktopTab = page.locator('[role="tab"]:visible').filter({ hasText: name }).first()
  if (await desktopTab.isVisible({ timeout: 500 }).catch(() => false)) {
    await desktopTab.click()
    return
  }
  // Mobile: открыть DropdownMenu trigger (aria-haspopup="listbox")
  await page.locator('button[aria-haspopup="listbox"]:visible').first().click()
  await page.getByRole('option', { name }).click()
}

/**
 * Универсальная проверка видимости view-таба: на desktop — role=tab,
 * на mobile — option внутри открытого DropdownMenu (открываем сами).
 */
export async function expectViewTabVisible(page, name) {
  // Try desktop first
  const desktopTab = page.locator('[role="tab"]:visible').filter({ hasText: name }).first()
  if (await desktopTab.isVisible({ timeout: 500 }).catch(() => false)) return desktopTab
  // Mobile: открываем dropdown и проверяем option
  await page.locator('button[aria-haspopup="listbox"]:visible').first().click()
  const opt = page.getByRole('option', { name })
  await opt.waitFor({ timeout: 3000 })
  // Закрываем после проверки (клик в стороне)
  await page.keyboard.press('Escape').catch(() => {})
  return opt
}

/**
 * Открыть мобильный sidebar если он скрыт.
 * На <768px sidebar по умолчанию closed; кнопка-burger «Меню» в шапке.
 * На обоих viewport'ах закрываем ShiftReminderModal (если открыт), иначе
 * его backdrop перехватывает click.
 */
export async function ensureSidebarOpen(page) {
  await dismissShiftModal(page)
  const viewport = page.viewportSize()
  if (!viewport || viewport.width >= 768) return // на desktop sidebar постоянно виден
  const visible = await visibleSidebar(page).isVisible({ timeout: 500 }).catch(() => false)
  if (visible) return
  await page.getByRole('button', { name: 'Меню' }).click()
  await visibleSidebar(page).waitFor({ timeout: 2000 })
}

/**
 * Раскрыть сворачиваемую группу в видимом сайдбаре по её заголовку (uppercase).
 * Sidebar groups: "Управление", "Производство", "Ресурсы", "Система".
 */
export async function expandSidebarGroup(page, groupLabel) {
  await ensureSidebarOpen(page)
  const btn = visibleSidebar(page).locator('button', { hasText: groupLabel.toUpperCase() })
  if (await btn.first().isVisible({ timeout: 1000 }).catch(() => false)) {
    await btn.first().click()
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
  // Кнопка-переключатель только в видимом сайдбаре (на мобилке desktop-aside
  // тоже содержит RoleSwitcher, но он спрятан CSS-ом).
  const switchBtn = visibleSidebar(page).getByRole('button', { name: 'Войти как пользователь' })
  await switchBtn.click()

  // Dropdown открывается рядом с кнопкой; локатор заголовка ограничиваем
  // самим сайдбаром, иначе риск зацепить чужой <p>.
  const header = visibleSidebar(page)
    .locator('p')
    .filter({ hasText: new RegExp(`^${roleLabel}$`, 'i') })
    .first()
  await header.waitFor({ timeout: 3000 })
  // Следующая кнопка после заголовка — первый user этой роли
  const firstUser = header.locator('xpath=following-sibling::button[1]')
  await firstUser.click()
  // Ждём появления RoleEmulationBanner — это маркер, что impersonatedProfile
  // действительно проставлен в store. Без этого следующие действия (goto, click)
  // могут гонять с асинхронным обновлением профиля.
  await page.getByRole('button', { name: 'Вернуться' }).waitFor({ timeout: 5000 })
  // После эмуляции воркера может всплыть ShiftReminderModal — убираем его,
  // чтобы не блокировал последующие клики.
  await dismissShiftModal(page)
}
