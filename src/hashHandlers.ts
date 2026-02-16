import { addToPlaylistAction } from './actions.js'
import { ensureBrowser, glPage, handleBrowserError } from './browser.js'
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
   try {
      await ensureBrowser()
      const page = glPage!

      // catch hashes from any graphql request
      const hashPromise = page
         .waitForResponse(
            async (res) => {
               const url = res.url()
               if (url.includes('query') || (url.includes('graphql') && res.status() === 200)) {
                  const body = res.request().postDataJSON()
                  if (!body) return false
                  const hash = body.extensions?.persistedQuery?.sha256Hash
                  if (hash) store.hashes[body.operationName] = hash
                  return body.operationName === op.name
               }
               return false
            },
            { timeout: 60000 },
         )
         .then((res) => (res.request().postDataJSON()?.extensions?.persistedQuery?.sha256Hash || null) as string | null)

      // load the page
      await page.goto(op.url, { waitUntil: 'domcontentloaded', timeout: 60000 })

      // perform action and listen for side hashes
      const [hash] = await Promise.all([hashPromise, op.action ? op.action(page) : Promise.resolve()])
      return hash
   } catch (err) {
      handleBrowserError(err)
      return null
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
