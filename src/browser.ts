import type { Browser, BrowserContext, Page } from 'playwright'
import { chromium } from 'playwright-extra'

export let glBrowser: Browser | null = null
export let glContext: BrowserContext | null = null
export let glPage: Page | null = null

export async function ensureBrowser() {
   if (glBrowser && glBrowser.isConnected() && glPage && !glPage.isClosed()) return

   // launch browser
   if (glBrowser) await glBrowser.close() // if not connected - close and create new one
   glBrowser = await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--disable-gpu', '--mute-audio', '--no-sandbox'],
   })

   // create context
   glContext = await glBrowser.newContext({
      locale: 'en-US',
      timezoneId: 'America/New_York',
      bypassCSP: true,
   })
   await glContext.addCookies([
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

   // open page
   glPage = await glContext.newPage()
   await glPage.route('**/*.{png,jpg,jpeg,gif,woff,woff2,sentry}', (r) => r.abort())
}

export async function handleBrowserError(error: unknown) {
   // close and clear browser
   if (glBrowser) {
      await glBrowser.close().catch(() => {})
      glBrowser = null
   }

   // handle error
   const details = error instanceof Error ? error.message : 'Unknown error'
   console.error('Error:', details)
   return details
}
