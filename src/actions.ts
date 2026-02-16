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
   console.log('page loaded')
   await dismissConsentIfPresent(page)
   console.log('page loaded and dissmissed')

   const track = page.locator('[data-testid="tracklist-row"]').first()
   await track.waitFor({ state: 'visible', timeout: slowHostTimeoutMs })
   console.log('track visible')
   await track.click({ button: 'right', timeout: slowHostTimeoutMs })
   console.log('track right-clicked')

   const menu = page.locator('[data-testid="context-menu"]')
   await menu.waitFor({ timeout: slowHostTimeoutMs })
   console.log('context menu visible')

   const addToPlaylistButton = menu.getByText('Add to Playlist', { exact: false })
   await addToPlaylistButton.waitFor({ state: 'visible', timeout: slowHostTimeoutMs })
   console.log('add to playlist button visible')
   await addToPlaylistButton.hover({ timeout: slowHostTimeoutMs })
   console.log('add to playlist button hovered')

   const input = page.locator('[placeholder="Find a playlist"]')
   await input.waitFor({ state: 'visible', timeout: slowHostTimeoutMs })
   console.log('playlist search input visible')
   await input.fill('TEST', { timeout: slowHostTimeoutMs })
   console.log('playlist search input filled')
   await page.waitForTimeout(5000)
   console.log('waited for search results to populate')

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

   // Wait for "Already added" dialog or the button to appear (if song is already in playlist)
   await page.waitForTimeout(5000)
   const addAnywayBtn = page.getByRole('button', { name: 'Add anyway' })
   try {
      await addAnywayBtn.waitFor({ state: 'visible', timeout: 15000 })
      console.log('is "Add anyway" button visible? true')
      await addAnywayBtn.click({ timeout: slowHostTimeoutMs })
      console.log('clicked "Add anyway" button')
   } catch {
      console.log('is "Add anyway" button visible? false')
   }

   // Wait a bit for the GraphQL request to fire
   await page.waitForTimeout(2000)
   console.log('finished addToPlaylistAction')
}
