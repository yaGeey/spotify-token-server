import type { Browser, BrowserContext, Page } from 'playwright'
import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

chromium.use(StealthPlugin())

export async function createInstance() {
   console.log(`-> Launching browser`)
   const browser = await chromium.launch({
      headless: true,
      args: [
         '--disable-dev-shm-usage',
         '--no-sandbox',
         '--disable-setuid-sandbox',
         '--disable-gpu',
         '--no-first-run',
         // '--single-process',
         '--mute-audio',
      ],
   })
   const context = await browser.newContext({
      locale: 'en-US',
      timezoneId: 'America/New_York',
      bypassCSP: true,
      // viewport: { width: 1920, height: 1080 }, // <--- ДОДАЙ ЦЕ
      deviceScaleFactor: 1,
   })
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
   await page.route('**/*.{png,jpg,jpeg,gif,woff,woff2,sentry}', (r) => r.abort())
   await page.route('**/*{onetrust,i.scdn.co/image/,mosaic.scdn.co/,encore.scdn.co/fonts}*', (r) => r.abort())
   return { browser, context, page }
}

export async function handleError(error: unknown) {
   const details = error instanceof Error ? error.message : 'Unknown error'
   console.error('💥 Error:', details)
   return details
}

export async function killBrowser(browser: Browser | null) {
   console.log(`<- Closing browser`)
   if (browser) await browser.close().catch(() => {})
   if (global.gc) global.gc() // force garbage collection to free RAM
}
