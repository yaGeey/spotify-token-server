import type { Page } from 'playwright'
import { browserWrapper } from './browser.js'
import { type Operation, store } from './storage.js'
import { delay } from './utils.js'
import { addToPlaylistAction, getModifyPlaylistHashAction } from './actions.js'
import { queue } from './index.js'
import chalk from 'chalk'

export const operations: Operation[] = [
   {
      names: ['addToPlaylist', 'removeFromPlaylist'],
      url: 'https://open.spotify.com/search/deco27/tracks',
      action: addToPlaylistAction,
   },
   // {
   //    type: 'action',
   //    names: ['addToPlaylist', 'removeFromPlaylist'],
   //    action: getModifyPlaylistHashAction,
   // },
   { names: ['fetchPlaylist'], url: 'https://open.spotify.com/playlist/79QHayucQm6M4wUlUbhQNQ' },
   {
      names: ['searchDesktop'],
      url: `https://open.spotify.com/search/deco27/tracks`,
   },
]

export async function captureQueryPromise(page: Page, operationNames: string[]) {
   const res = await page.waitForResponse(
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
                  // Record hash for ALL operation names since they share the same hash
                  for (const name of operationNames) {
                     store.tempHashes[name] = hash
                  }
               }
               return operationNames.includes(body.operationName)
            } catch {
               return false
            }
         }
         return false
      },
      { timeout: 150000 },
   )

   const hash = (res.request().postDataJSON()?.extensions?.persistedQuery?.sha256Hash || null) as string | null
   const json = await res.json().catch(() => null)

   return { hash, json: operationNames.length === 1 ? json : null }
}

export async function updateHash(page: Page, op: Operation) {
   console.log(chalk.blue(`Updating hash for ${op.names.join(', ')}`))
   if (op.type === 'action') {
      // For action-based operations, the action handles everything including capturing hashes
      await op.action(page, op.names).catch((e) => {
         throw new Error(`Action failed: ${e.message}`)
      })
      // Return the hash for the first name (they all share the same hash)
      const hash = store.tempHashes[op.names[0]] || null
      console.log(`Hash for ${op.names.join(', ')}: ${hash}`)
      return hash
   }

   // For URL-based operations
   const queryPromise = captureQueryPromise(page, op.names).catch((err) => {
      console.warn(`⚠️ [${op.names}] Hash listener ended: ${err.message}`)
      return null
   })

   await page.goto(op.url, { waitUntil: 'domcontentloaded', timeout: 120000 })

   const actionPromise = op.action
      ? op.action(page, op.names).catch((e) => {
           throw new Error(`Action failed: ${e.message}`)
        })
      : Promise.resolve()

   await Promise.all([queryPromise, actionPromise])

   const hash = store.tempHashes[op.names[0]] || null
   console.log(chalk.green(`Hash for ${op.names.join(', ')}: ${hash}`))
   return hash
}

export async function updateAllHashes() {
   const res: Record<string, string | null> = {}
   store.tempHashes = {}

   for (const op of operations) {
      // if we already have hashes from previos operations, we can skip
      if (op.names.every((name) => store.tempHashes[name])) continue
      const hash = await queue.add(() => browserWrapper((page) => updateHash(page, op)))
      op.names.forEach((name) => (res[name] = hash))
      await delay(800)
   }

   store.tempHashes = {}
   return res
}
