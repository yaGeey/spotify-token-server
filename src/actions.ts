import type { Page } from 'playwright'

const dismissConsentIfPresent = async (page: Page) => {
   const overlay = page.locator('#onetrust-consent-sdk')
   const isVisible = await overlay.isVisible().catch(() => false)
   if (!isVisible) return

   const accept = page.locator('#onetrust-accept-btn-handler, button:has-text("Accept"), button:has-text("I agree")').first()
   if (await accept.isVisible().catch(() => false)) {
      await accept.click({ timeout: 5000 }).catch(() => {})
   } else {
      const close = page.locator('button[aria-label="Close"], button:has-text("Close")').first()
      await close.click({ timeout: 5000 }).catch(() => {})
   }

   await overlay.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
}

export const addToPlaylistAction = async (page: Page) => {
   const slowHostTimeoutMs = 90000 // Зменшив, 90с це занадто, краще впасти раніше

   await page.waitForLoadState('networkidle', { timeout: slowHostTimeoutMs }) // Важливо: networkidle краще ніж domcontentloaded для SPA
   await dismissConsentIfPresent(page)

   const track = page.locator('[data-testid="tracklist-row"]').first()
   await track.waitFor({ state: 'visible', timeout: slowHostTimeoutMs })

   // ТРЮК 1: Примусовий скрол до елемента перед кліком
   await track.scrollIntoViewIfNeeded()
   await track.click({ button: 'right', timeout: slowHostTimeoutMs })

   const menu = page.locator('[data-testid="context-menu"]')
   await menu.waitFor({ state: 'visible', timeout: slowHostTimeoutMs })

   const addToPlaylistButton = menu.getByText('Add to Playlist', { exact: false })
   await addToPlaylistButton.waitFor({ state: 'visible' })
   await addToPlaylistButton.hover() // Hover обов'язковий

   const input = page.locator('[placeholder="Find a playlist"]')
   await input.waitFor({ state: 'visible', timeout: slowHostTimeoutMs })

   // ТРЮК 2: Повільний ввід тексту. Це дає React час обробити стейт.
   // Замість fill використовуємо pressSequentially з затримкою
   await input.pressSequentially('TEST', { delay: 100 })

   // Даємо час на рендеринг відфільтрованого списку
   await page.waitForTimeout(1500)

   // ТРЮК 3: Замість кліку мишкою - ENTER
   // Після пошуку фокус зазвичай залишається в input або перший елемент стає активним.
   // Спробуємо натиснути стрілку вниз (щоб точно вибрати плейліст) і Enter.
   const targetPlaylist = page.getByRole('menuitem', { name: 'TEST', exact: true }).first()
   if (!(await targetPlaylist.isVisible())) {
      console.log('playlist not found in search results, clicking search result to trigger playlist loading')
      await dismissConsentIfPresent(page)
      console.log('dissmissed')
      await page.getByText('TEST', { exact: true }).first().click({ force: true, timeout: slowHostTimeoutMs })
      console.log('clicked search result, waiting for playlist to appear in search results')
   } else {
      console.log('playlist found in search results, clicking it')
      await dismissConsentIfPresent(page)
      console.log('dissmissed')
      await targetPlaylist.click({ force: true, timeout: slowHostTimeoutMs })
      console.log('clicked playlist in search results')
   }

   // Wait for context menu to close implicitly
   await menu.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})

   // --- БЛОК ОБРОБКИ "Add Anyway" ---
   // Тут важливо чекати не просто появи, а появи АБО зникнення діалогу
   // Але оскільки нам треба клікнути, чекаємо кнопку.

   try {
      const addAnywayBtn = page.getByRole('button', { name: /add anyway/i })
      // Чекаємо трохи довше, бо модалка може мати анімацію появи
      await addAnywayBtn.waitFor({ state: 'visible', timeout: 15000 })

      console.log('"Add anyway" visible, clicking...')
      // Тут теж краще без force, якщо можливо, але для модалок force допустимий
      await addAnywayBtn.click()
   } catch (e) {
      console.log('"Add anyway" button did not appear (track likely added or not duplicate)')
   }

   // Фінальне очікування, щоб запит встиг піти
   await page.waitForTimeout(3000)
}
