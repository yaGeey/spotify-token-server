import express from 'express'
import { chromium } from 'playwright-extra'
import 'dotenv/config'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import PQueue from 'p-queue'
import cron from 'node-cron'
import { store, type AccessTokenResponse, type TokenResponse } from './storage.js'
import { ensureBrowser, glPage, handleBrowserError } from './browser.js'
import { delay } from './utils.js'
import { updateAllHashes, operations, updateHash } from './hashHandlers.js'

const app = express()
const PORT = process.env.PORT || 3000
chromium.use(StealthPlugin())
const queue = new PQueue({ concurrency: 1 })

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

         await ensureBrowser()
         const page = glPage!

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
      res.json(result)
   } catch (error) {
      const details = handleBrowserError(error)
      res.status(500).json({ error: 'Failed to get token', details })
   }
})

app.get('/hashes', (req, res) => {
   const raw = req.query.names as string | undefined
   if (raw) {
      const names = raw.split(',')
      const filtered = Object.fromEntries(Object.entries(store.hashes).filter(([key]) => names.includes(key)))
      res.json(filtered)
   } else {
      res.json(store.hashes)
   }
})

app.put('/hashes', async (req, res) => {
   const raw = req.query.names as string
   let hashes: { name: string; hash: string | null }[] = []

   if (!raw) {
      // update all
      hashes = await queue.add(updateAllHashes)
   } else {
      // update selected
      const names = raw.split(',')
      for (const name of names) {
         const op = operations.find((o) => o.name === name)
         if (!op) continue
         const hash = await queue.add(() => updateHash(op))
         hashes.push({ name: op.name, hash })
         await delay(800)
      }
      if (hashes.length === 0) {
         return res.status(400).json({ error: 'No valid operation names provided' })
      }
      if (hashes.length !== names.length) {
         return res.status(404).json({ error: 'Some operation names were invalid', details: { raw, hashes } })
      }
   }

   if (hashes.map((h) => h.hash).some((h) => h === null)) {
      console.error('Failed to update some hashes', hashes)
      return res.status(502).json({ error: 'Failed to update some hashes', details: hashes })
   }

   res.json({ requested: Object.fromEntries(hashes.map((i) => [i.name, i.hash])), all: store.hashes })
})

cron.schedule('0 3 * * *', () => {
   const randomDelay = Math.floor(Math.random() * 1000 * 60 * 60 * 2)
   setTimeout(async () => {
      await queue.add(async () => {
         const hashes = await updateAllHashes()
         if (hashes.map((h) => h.hash).some((h) => h === null)) {
            console.error('cron: Failed to update some hashes', hashes)
         }
      })
   }, randomDelay)
})

app.listen(PORT, () => {
   console.log(`Server running on port ${PORT}`)
})
