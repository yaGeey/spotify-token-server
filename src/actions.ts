import type { Page } from 'playwright'
import { captureQueryPromise } from './hashHandlers.js'

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
   await targetPlaylist.waitFor({ state: 'visible', timeout: 10000 })
   try {
      await targetPlaylist.click({ timeout: 5000 })
   } catch {
      await targetPlaylist.click({ force: true, timeout: 5000 })
   }
   const addAnywayBtn = page.getByRole('button', { name: 'Add anyway' })
   await addAnywayBtn.click()
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
