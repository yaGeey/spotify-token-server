import { addToPlaylistAction } from './actions.js'
import { createInstance, killBrowser, handleError } from './browser.js'
import { type Operation, store } from './storage.js'
import { delay } from './utils.js'

export const operations: Operation[] = [
   { name: 'fetchPlaylist', url: 'https://open.spotify.com/playlist/79QHayucQm6M4wUlUbhQNQ' },
   {
      name: 'searchDesktop',
      url: `https://open.spotify.com/search/deco27/tracks`,
   },
   {
      name: 'addToPlaylist',
      url: 'https://open.spotify.com/search/deco27/tracks',
      action: addToPlaylistAction,
   },
]

export async function updateHash(op: Operation) {
   const { browser, page } = await createInstance()

   try {
      const hashPromise = page
         .waitForResponse(
            async (res) => {
               const url = res.url()
               if (url.includes('query') || (url.includes('graphql') && res.status() === 200)) {
                  try {
                     const body = res.request().postDataJSON()
                     if (!body) return false
                     const hash = body.extensions?.persistedQuery?.sha256Hash
                     if (hash) {
                        console.log(body.operationName)
                        store.hashes[body.operationName] = hash
                     }
                     return body.operationName === op.name
                  } catch {
                     return false
                  }
               }
               return false
            },
            { timeout: 60000 },
         )
         .then((res) => (res.request().postDataJSON()?.extensions?.persistedQuery?.sha256Hash || null) as string | null)
         .catch((err) => {
            console.warn(`⚠️ [${op.name}] Hash listener ended: ${err.message}`)
            return null
         })

      await page.goto(op.url, { waitUntil: 'domcontentloaded', timeout: 90000 })

      const actionPromise = op.action
         ? op.action(page).catch((e) => {
              throw new Error(`Action failed: ${e.message}`)
           })
         : Promise.resolve()

      const [hash] = await Promise.all([hashPromise, actionPromise])
      return hash
   } catch (err) {
      handleError(err)
      return null
   } finally {
      await killBrowser(browser)
   }
}

export async function updateAllHashes() {
   const res = []
   for (const op of operations) {
      const hash = await updateHash(op)
      res.push({ name: op.name, hash })
      await delay(800)
   }
   return res
}
