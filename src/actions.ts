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
   const slowHostTimeoutMs = 90000

   await page.waitForLoadState('domcontentloaded', { timeout: slowHostTimeoutMs })
   await dismissConsentIfPresent(page)

   const track = page.locator('[data-testid="tracklist-row"]').first()
   await track.waitFor({ state: 'visible', timeout: slowHostTimeoutMs })
   await track.click({ button: 'right' })

   const menu = page.locator('[data-testid="context-menu"]')
   await menu.waitFor()

   const addToPlaylistButton = menu.getByText('Add to Playlist', { exact: false })
   await addToPlaylistButton.hover()

   const input = page.locator('[placeholder="Find a playlist"]')
   await input.fill('TEST')
   await page.waitForTimeout(500)

   const targetPlaylist = page.getByRole('menuitem', { name: 'TEST', exact: true }).first()
   if (!(await targetPlaylist.isVisible())) {
      await dismissConsentIfPresent(page)
      await page.getByText('TEST', { exact: true }).first().click()
   } else {
      await dismissConsentIfPresent(page)
      await targetPlaylist.click()
   }

   const addAnywayBtn = page.getByRole('button', { name: 'Add anyway' })
   await addAnywayBtn.click()
}
