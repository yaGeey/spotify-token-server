import express from 'express'
import 'dotenv/config'
import PQueue from 'p-queue'
import cron from 'node-cron'
import { store, type AccessTokenResponse, type Hashes, type TokenResponse } from './storage.js'
import { createInstance, killBrowser, handleError, browserWrapper } from './browser.js'
import { delay } from './utils.js'
import { updateAllHashes, operations, updateHash } from './hashHandlers.js'
import type { Browser } from 'playwright'
import chalk from 'chalk'

const app = express()
const PORT = process.env.PORT || 3000
export const queue: PQueue = new PQueue({ concurrency: 1 })

// Health check - must be before auth middleware
app.get('/', (req, res) => {
   res.send('alive')
})

app.use((req, res, next) => {
   if (req.headers['authorization'] !== process.env.API_SECRET) {
      return res.status(403).json({ error: 'Wrong Secret Key' })
   }
   next()
})

if (!process.env.API_SECRET || !process.env.SP_DC || !process.env.SP_KEY) {
   console.error('Error: Missing required environment variables. Please set API_SECRET, SP_DC, and SP_KEY.')
   process.exit(1)
}

// TODO give userId
// TODO give sha codes on 401 / !412! error on client. separate route

function isTokenValid(): boolean {
   return !!(
      store.access &&
      store.access.accessTokenExpirationTimestampMs > Date.now() &&
      store.client &&
      store.client.expiresAt > Date.now()
   )
}

app.get('/token', async (req, res) => {
   let exBrowser: Browser | null = null
   try {
      // return token if valid
      if (isTokenValid()) {
         console.log('Returning cached data')
         return res.json({ access: store.access!, client: store.client! } satisfies TokenResponse)
      }

      const result = await queue.add(async (): Promise<TokenResponse> => {
         // if there was a request before, check it's result before making new one
         if (isTokenValid()) {
            console.log('Returning cached data')
            return { access: store.access!, client: store.client! } satisfies TokenResponse
         }

         const { browser, page } = await createInstance()
         exBrowser = browser

         // access token
         const accessTokenPromise = page
            .waitForResponse(async (res) => res.url().includes('https://open.spotify.com/api/token') && res.status() === 200)
            .then(async (res) => res.json() as Promise<AccessTokenResponse>)

         // client token
         const clientTokenPromise = page
            .waitForResponse(
               async (res) => res.url().includes('https://clienttoken.spotify.com/v1/clienttoken') && res.status() === 200,
            )
            .then(async (res) => {
               const json = await res.json().catch(() => null)
               const req = res.request()
               const payload = req.postDataJSON()

               return {
                  ...json.granted_token,
                  client_version: payload.client_data.client_version,
               }
            })

         // get tokens
         const [accessTokenRes, clientTokenRes] = await Promise.all([
            accessTokenPromise,
            clientTokenPromise,
            page.goto('https://open.spotify.com/', { waitUntil: 'domcontentloaded', timeout: 60000 }),
         ])
         console.log('Token obtained successfully')

         // format data
         store.access = accessTokenRes
         store.client = {
            expiresAt: Date.now() + clientTokenRes.refresh_after_seconds * 1000,
            token: clientTokenRes.token,
            version: clientTokenRes.client_version,
         }
         return { access: store.access!, client: store.client! } satisfies TokenResponse
      })

      killBrowser(exBrowser)
      res.json(result)
   } catch (err) {
      const details = handleError(err)
      killBrowser(exBrowser)
      res.status(500).json({ error: 'Failed to get token', details })
   }
})

app.get('/hashes', (req, res) => {
   const raw = req.query.names as string | undefined
   if (raw) {
      const names = raw.split(',')
      const filtered = Object.fromEntries(Object.entries(store.hashes).filter(([key]) => names.includes(key)))
      res.json({ requested: filtered, all: store.hashes })
   } else {
      res.json({ requested: {}, all: store.hashes })
   }
})

app.put('/hashes', async (req, res) => {
   const raw = req.query.names as string
   let tempHash = store.tempHashes

   const names = raw ? raw.split(',') : null

   if (!names) {
      // update all
      tempHash = await updateAllHashes()
   } else {
      // update selected
      for (const name of names) {
         const op = operations.find((o) => o.names.includes(name))
         if (!op || op.names.every((name) => tempHash[name])) {
            console.log(`Skipping ${name}`)
            continue
         }

         const hash = await queue.add(() => browserWrapper((page) => updateHash(page, op)))
         // Record hash for ALL names in the operation
         for (const opName of op.names) tempHash[opName] = hash
         await delay(800)
      }
      const hashesAmount = Object.keys(tempHash).length
      if (hashesAmount === 0) {
         return res.status(400).json({ error: 'No valid operation names provided' })
      }
      if (names.some((name) => !operations.some((op) => op.names.includes(name)))) {
         return res.status(404).json({
            error: 'Some operation names were invalid',
            details: { raw, hashes: tempHash },
         })
      }
   }

   if (Object.keys(tempHash).some((key) => tempHash[key] === null)) {
      console.error('Failed to update some hashes', tempHash)
      return res.status(502).json({ error: 'Failed to update some hashes', details: tempHash })
   }

   store.tempHashes = {}
   Object.assign(store.hashes, tempHash)
   const requested = Object.fromEntries(Object.entries(store.hashes).filter(([key, value]) => names?.includes(key) && value))
   res.json({ requested, all: store.hashes })
})

cron.schedule('0 3 * * *', () => {
   const randomDelay = Math.floor(Math.random() * 1000 * 60 * 60 * 2)
   setTimeout(async () => {
      await queue.add(async () => {
         const hashes = await updateAllHashes()
         if (Object.keys(hashes).some((key) => hashes[key] === null)) {
            console.error('cron: Failed to update some hashes', hashes)
         }
      })
   }, randomDelay)
})

app.listen(PORT, () => {
   console.log(`Server running on port ${PORT}`)
})
