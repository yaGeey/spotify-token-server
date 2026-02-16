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

   // Log track details
   const trackName = await track
      .locator('[data-testid="internal-track-link"]')
      .first()
      .textContent()
      .catch(() => 'unknown')
   const trackArtist = await track
      .locator('a[href*="/artist/"]')
      .first()
      .textContent()
      .catch(() => 'unknown')
   console.log(`Track being right-clicked: "${trackName}" by ${trackArtist}`)

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
   // await page.waitForTimeout(5000)
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

   // Wait for context menu to close
   await menu.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => console.log('menu did not hide'))
   console.log('context menu closed')

   // Wait for UI to settle and check for "Already added" dialog
   await page.waitForTimeout(3000)

   // Log all visible dialogs for debugging
   const allDialogs = await page.locator('[role="dialog"]').count()
   console.log(`Number of dialogs visible: ${allDialogs}`)
   if (allDialogs > 0) {
      const dialogText = await page
         .locator('[role="dialog"]')
         .first()
         .textContent()
         .catch(() => 'unable to read')
      console.log(`Dialog text: ${dialogText}`)
   }

   // Check if "Already added" dialog appeared (only if song was already in playlist)
   const addAnywayBtn = page.getByRole('button', { name: /add anyway/i })
   const isVisible = await addAnywayBtn.isVisible().catch(() => false)
   console.log(`is "Add anyway" button visible? ${isVisible}`)
   if (isVisible) {
      await addAnywayBtn.click({ timeout: slowHostTimeoutMs })
      console.log('clicked "Add anyway" button')
      // Wait longer for the addToPlaylist GraphQL operation to fire after clicking
      console.log('waiting for addToPlaylist operation to fire...')
      await page.waitForTimeout(15000)
   } else {
      // If no dialog, track was added successfully - wait for operation
      console.log('waiting for addToPlaylist operation to fire...')
      await page.waitForTimeout(15000)
   }

   console.log('finished addToPlaylistAction')
}
