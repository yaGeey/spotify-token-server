import express from 'express'
import { chromium } from 'playwright'
import 'dotenv/config'
const app = express()
const PORT = process.env.PORT || 3000

let tokenObj = null

app.get('/', (req, res) => {
   res.send('alive')
})

app.get('/token', async (req, res) => {
   if (req.headers['authorization'] !== process.env.API_SECRET) {
      return res.status(403).json({ error: 'Wrong Secret Key' })
   }

   if (tokenObj && tokenObj.accessTokenExpirationTimestampMs > Date.now()) {
      console.log('Returning cached token')
      return res.json(tokenObj)
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
            value: process.env.SP_DC,
            domain: '.spotify.com',
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'None',
         },
         {
            name: 'sp_key',
            value: process.env.SP_KEY,
            domain: '.spotify.com',
            path: '/',
            httpOnly: false,
            secure: true,
            sameSite: 'None',
         },
      ])

      const page = await context.newPage()

      const [tokenResponse] = await Promise.all([
         page.waitForResponse(async (response) => {
            const url = response.url()
            if (url.includes('token') && response.status() === 200) {
               const json = await response.json().catch(() => null)
               return json && json.accessToken
            }
            return false
         }),
         page.goto('https://open.spotify.com/', { waitUntil: 'domcontentloaded' }),
      ])
      const data = await tokenResponse.json()

      console.log('Token obtained successfully')
      tokenObj = data
      res.json(data)
   } catch (error) {
      console.error('Error:', error.message)
      res.status(500).json({ error: 'Failed to get token', details: error.message })
   } finally {
      if (browser) await browser.close()
   }
})

app.listen(PORT, () => {
   console.log(`Server running on port ${PORT}`)
})
