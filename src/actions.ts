import type { Locator, Page } from 'playwright'
import { captureQueryPromise } from './hashHandlers.js'

const clickWithFallback = async (locator: Locator, timeout = 5000) => {
   try {
      await locator.click({ timeout })
   } catch {
      await locator.click({ force: true, timeout })
   }
}

const waitForPlaylistPickerToClose = async (input: Locator, timeout = 1500) => {
   return input
      .waitFor({ state: 'hidden', timeout })
      .then(() => true)
      .catch(() => false)
}

const dismissBlockingLayers = async (page: Page) => {
   await page
      .evaluate(
         ({ selectors }) => {
            const doc = (globalThis as any).document as any
            if (!doc) return

            for (const selector of selectors) {
               const nodes = doc.querySelectorAll(selector)
               for (const node of nodes) {
                  const element = node as any
                  element.style.setProperty('display', 'none', 'important')
                  element.style.setProperty('visibility', 'hidden', 'important')
                  element.style.setProperty('pointer-events', 'none', 'important')
               }
            }

            doc.body?.style.removeProperty('overflow')
         },
         {
            selectors: [
               '#onetrust-consent-sdk',
               '.ot-sdk-container',
               '.onetrust-pc-dark-filter',
               '.onetrust-close-btn-container',
               'iframe[src*="consent"]',
               'iframe[src*="recaptcha"]',
            ],
         },
      )
      .catch(() => {})
}

const waitForPickerOrMenuToClose = async (input: Locator, menu: Locator, timeout = 1800) => {
   const inputClosed = await waitForPlaylistPickerToClose(input, timeout)
   if (inputClosed) return true

   return menu
      .waitFor({ state: 'hidden', timeout })
      .then(() => true)
      .catch(() => false)
}

const selectPlaylistWithFallbacks = async (page: Page, input: Locator, menu: Locator, targetPlaylist: Locator) => {
   await input.press('Enter', { timeout: 900 }).catch(() => {})
   if (await waitForPickerOrMenuToClose(input, menu)) return true

   await input.press('ArrowDown', { timeout: 900 }).catch(() => {})
   await input.press('Enter', { timeout: 900 }).catch(() => {})
   if (await waitForPickerOrMenuToClose(input, menu)) return true

   await clickWithFallback(targetPlaylist)
   if (await waitForPickerOrMenuToClose(input, menu)) return true

   await page
      .evaluate(() => {
         const doc = (globalThis as any).document as any
         if (!doc) return

         const items = Array.from(doc.querySelectorAll('[role="menuitem"]')) as any[]
         const target = items.find((el) => el.textContent?.trim().toLowerCase() === 'test')
         target?.click()
      })
      .catch(() => {})

   return waitForPickerOrMenuToClose(input, menu)
}

export const addToPlaylistAction = async (page: Page) => {
   await page.waitForLoadState('domcontentloaded')
   for (let attempt = 1; attempt <= 2; attempt++) {
      await dismissBlockingLayers(page)

      const track = page.locator('[data-testid="tracklist-row"]').first()
      await track.click({ button: 'right' })

      const menu = page.locator('[data-testid="context-menu"]')
      const addToPlaylistButton = menu.getByText('Add to Playlist', { exact: false })
      await addToPlaylistButton.hover()

      const input = page.locator('[placeholder="Find a playlist"]')
      await input.fill('').catch(() => {})
      await input.pressSequentially('TEST')

      const targetPlaylist = page.getByRole('menuitem', { name: 'TEST', exact: true }).first()
      await targetPlaylist.waitFor({ state: 'visible', timeout: 10000 })

      const selected = await selectPlaylistWithFallbacks(page, input, menu, targetPlaylist)
      if (!selected) {
         await page.keyboard.press('Escape').catch(() => {})
         if (attempt === 2) {
            throw new Error('Failed to select TEST playlist after retries')
         }
         continue
      }

      // This button only appears when Spotify detects a duplicate track in playlist.
      const addAnywayBtn = page.getByRole('button', { name: /add anyway/i }).first()
      await addAnywayBtn
         .waitFor({ state: 'visible', timeout: 4000 })
         .then(() => clickWithFallback(addAnywayBtn))
         .catch(() => {})

      return
   }
}

export const removeFromPlaylistAction = async (page: Page) => {
   await page.waitForLoadState('domcontentloaded')
   const track = page.locator('[data-testid="tracklist-row"]').first()
   const clickZone = track.locator('[aria-colindex="2"]').first()
   await clickZone.click({ button: 'right' })
   const menu = page.locator('[data-testid="context-menu"]')
   const btn = menu.getByText('Remove from this playlist')
   await btn.click()
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
