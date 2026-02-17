import type { Page } from 'playwright'
import { captureQueryPromise } from './hashHandlers.js'

const dismissConsentIfPresent = async (page: Page) => {
   // Remove OneTrust consent completely via JS
   await page
      .evaluate(() => {
         // @ts-expect-error - document exists in browser context
         const consent = document.querySelector('#onetrust-consent-sdk')
         if (consent) consent.remove()
      })
      .catch(() => {})

   // Fallback: try clicking accept button
   const overlay = page.locator('#onetrust-consent-sdk')
   const isVisible = await overlay.isVisible().catch(() => false)
   if (!isVisible) return

   // Support for German OneTrust modal buttons
   const accept = page
      .locator(
         '#onetrust-accept-btn-handler, button:has-text("Akzeptieren"), button:has-text("Accept"), button:has-text("Alle akzeptieren")',
      )
      .first()
   if (await accept.isVisible().catch(() => false)) {
      await accept.click({ timeout: 5000 }).catch(() => {})
   } else {
      const close = page
         .locator(
            'button[aria-label="Schließen"], button[aria-label="Close"], button:has-text("Schließen"), button:has-text("Close")',
         )
         .first()
      await close.click({ timeout: 5000 }).catch(() => {})
   }

   await overlay.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
}

export const addToPlaylistAction = async (page: Page) => {
   await page.waitForLoadState('domcontentloaded')
   const track = page.locator('[data-testid="tracklist-row"]').first()
   await track.click({ button: 'right' })
   const menu = page.locator('[data-testid="context-menu"]')
   const addToPlaylistButton = menu.getByText('Add to Playlist', { exact: false })
   await addToPlaylistButton.hover()
   const input = page.locator('[placeholder="Find a playlist"]')
   await input.pressSequentially('TEST')
   const targetPlaylist = page.getByRole('menuitem', { name: 'TEST', exact: true }).first()
   await targetPlaylist.click()
   const addAnywayBtn = page.getByRole('button', { name: 'Add anyway' })
   await addAnywayBtn.click()
}

export const removeFromPlaylistAction = async (page: Page) => {
   const timeout = 60000

   await page.waitForLoadState('networkidle', { timeout })
   await dismissConsentIfPresent(page)
   console.log('[a] page loaded')

   const track = page.locator('[data-testid="tracklist-row"]').first()
   await track.waitFor({ state: 'visible', timeout })
   console.log('[a] track found')
   const clickZone = track.locator('[aria-colindex="2"]').first()
   await clickZone.waitFor({ state: 'visible', timeout })
   console.log('[a] clickZone found')

   // Remove consent again just before clicking
   await dismissConsentIfPresent(page)
   await clickZone.click({ button: 'right', timeout, force: true })
   console.log('[a] right-clicked track')

   const menu = page.locator('[data-testid="context-menu"]')
   await menu.waitFor({ state: 'visible', timeout })
   console.log('[a] context menu visible')

   const btn = menu.getByText('Remove from this playlist')
   await btn.waitFor({ state: 'visible', timeout })
   await btn.click({ timeout })
   console.log('[a] remove from playlist btn clicked')

   await page.waitForTimeout(3000)
}

// fetchPlaylist + modify hashes + (possibly search)
export const getModifyPlaylistHashAction = async (page: Page, names: string[]): Promise<void> => {
   await page.goto('https://open.spotify.com/playlist/6uXwlbGoEnIQT9Cu5RsuxP', {
      waitUntil: 'domcontentloaded',
   })
   const queryData = await captureQueryPromise(page, ['fetchPlaylist'])
   const result = queryData?.json
   if (!result) throw new Error('No data in fetchPlaylist response')

   if (result.data.playlistV2.content.totalCount === 0) {
      console.log('Playlist is empty, using addToPlaylist flow to get hash')

      // Close current page and create new one to free RAM
      const context = page.context()
      await page.close()
      const newPage = await context.newPage()
      await newPage.route('**/*.{png,jpg,jpeg,gif,woff,woff2,sentry}', (r) => r.abort())
      await newPage.route('**/*{onetrust,i.scdn.co/image/,mosaic.scdn.co/,encore.scdn.co/fonts}*', (r) => r.abort())
      await newPage.addStyleTag({
         content: '#onetrust-consent-sdk { display: none !important; pointer-events: none !important; }',
      })

      await newPage.goto('https://open.spotify.com/search/deco27/tracks', { waitUntil: 'domcontentloaded' })
      const addPromise = captureQueryPromise(newPage, names).catch(() => null)
      await Promise.all([addPromise, addToPlaylistAction(newPage)])
   } else {
      const removePromise = captureQueryPromise(page, names).catch(() => null)
      await Promise.all([removePromise, removeFromPlaylistAction(page)])
   }
}
