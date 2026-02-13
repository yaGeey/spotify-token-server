import express from 'express'
import { chromium } from 'playwright-extra'
import 'dotenv/config'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
const app = express()
const PORT = process.env.PORT || 3000
chromium.use(StealthPlugin())

if (!process.env.API_SECRET || !process.env.SP_DC || !process.env.SP_KEY) {
   console.error('Error: Missing required environment variables. Please set API_SECRET, SP_DC, and SP_KEY.')
   process.exit(1)
}

let acessTokenObj: { clientId: string; accessToken: string; accessTokenExpirationTimestampMs: number } | null = null
let clientTokenObj: { expires_at: number; token: string } | null = null

app.get('/', (req, res) => {
   res.send('alive')
})

app.get('/token', async (req, res) => {
   if (req.headers['authorization'] !== process.env.API_SECRET) {
      return res.status(403).json({ error: 'Wrong Secret Key' })
   }

   if (
      acessTokenObj &&
      acessTokenObj.accessTokenExpirationTimestampMs > Date.now() &&
      clientTokenObj &&
      clientTokenObj.expires_at > Date.now()
   ) {
      console.log('Returning cached data')
      return res.json({...acessTokenObj, clientToken: clientTokenObj.token})
   }

   let browser = null
   try {
      browser = await chromium.launch({
         headless: true,
         args: ['--disable-dev-shm-usage'],
      })

      const context = await browser.newContext()

      await context.addCookies([
         {
            name: 'sp_dc',
            value: process.env.SP_DC!,
            domain: '.spotify.com',
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'None',
         },
         {
            name: 'sp_key',
            value: process.env.SP_KEY!,
            domain: '.spotify.com',
            path: '/',
            httpOnly: false,
            secure: true,
            sameSite: 'None',
         },
      ])

      const page = await context.newPage()

      const accessTokenPromise = page
         .waitForResponse(async (res) => res.url().includes('https://open.spotify.com/api/token') && res.status() === 200)
         .then(async (res) => res.json())

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

      const [accessTokenRes, clientTokenRes] = await Promise.all([
         accessTokenPromise,
         clientTokenPromise,
         page.goto('https://open.spotify.com/', { waitUntil: 'domcontentloaded' }),
      ])
      console.log('Token obtained successfully')

      acessTokenObj = accessTokenRes
      clientTokenObj = {
         expires_at: Date.now() + clientTokenRes.refresh_after_seconds * 1000,
         token: clientTokenRes.token,
      }

      res.json({ ...acessTokenObj, clientToken: clientTokenObj.token })
   } catch (error: any) {
      console.error('Error:', error.message)
      res.status(500).json({ error: 'Failed to get token', details: error.message })
   } finally {
      if (browser) await browser.close()
   }
})

app.listen(PORT, () => {
   console.log(`Server running on port ${PORT}`)
})
