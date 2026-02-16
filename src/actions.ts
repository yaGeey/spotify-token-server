import type { Page } from 'playwright'

export const addToPlaylistAction = async (page: Page) => {
   const track = page.locator('[data-testid="tracklist-row"]').first()
   await track.waitFor({ state: 'visible' })
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
      await page.getByText('TEST', { exact: true }).first().click()
   } else {
      await targetPlaylist.click()
   }

   const addAnywayBtn = page.getByRole('button', { name: 'Add anyway' })
   await addAnywayBtn.click()
}
