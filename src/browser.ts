import type { Browser, BrowserContext, Page } from 'playwright'
import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { store } from './storage.js'
import { logMemory } from './utils.js'

chromium.use(StealthPlugin())

const createContext = async (browser: Browser) => {
   const context = await browser.newContext({
      locale: 'en-US',
      timezoneId: 'America/New_York',
      bypassCSP: true,
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
   return context
}

export const createPageFromBrowser = async (browser: Browser) => {
   const context = await createContext(browser)
   const page = await context.newPage()
   await page.route('**/*.{png,jpg,jpeg,gif,woff,woff2,sentry}', (r) => r.abort())
   await page.route('**/*{onetrust,i.scdn.co/image/,mosaic.scdn.co/,encore.scdn.co/fonts}*', (r) => r.abort())
   await page.addInitScript(`
      (() => {
         const selectors = [
            '#onetrust-consent-sdk',
            '.onetrust-pc-dark-filter',
            '.ot-sdk-container',
            '.onetrust-close-btn-container',
         ]

         const hideOverlay = () => {
            for (const selector of selectors) {
               const nodes = document.querySelectorAll(selector)
               for (const node of nodes) {
                  const element = node
                  element.style.setProperty('display', 'none', 'important')
                  element.style.setProperty('visibility', 'hidden', 'important')
                  element.style.setProperty('pointer-events', 'none', 'important')
               }
            }

            if (document.body) {
               document.body.style.removeProperty('overflow')
            }
         }

         hideOverlay()
         const observer = new MutationObserver(() => hideOverlay())
         observer.observe(document.documentElement, { childList: true, subtree: true })
      })()
   `)
   return page
}

let browserPromise: Promise<Browser> | null = null
export async function ensureBrowser(): Promise<Browser> {
   if (browserPromise) {
      const b = await browserPromise.catch(() => null)
      if (!b || !b.isConnected()) {
         browserPromise = null
         store.browser = null
      }
   }

   if (!browserPromise) {
      browserPromise = (async () => {
         const b = await chromium.launch({
            headless: true,
            args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
         })
         b.on('disconnected', () => {
            console.warn('Browser disconnected')
            browserPromise = null
            store.browser = null
         })
         return b
      })()
   }

   const browser = await browserPromise
   store.browser = browser
   return browser
}

export async function restartBrowser() {
   if (store.browser) {
      await store.browser.close()
      store.browser = null
   }
   return ensureBrowser()
}

export function handleError(error: unknown) {
   const details = error instanceof Error ? error.message : 'Unknown error'
   console.error('💥 Error:', details)
   return details
}

export async function killBrowser(browser: Browser | null) {
   console.log(`<- Closing browser`)
   if (browser) await browser.close().catch(() => {})
}

export async function closeContexts(browser: Browser | null) {
   console.log(`<- Closing contexts`)
   if (browser) {
      const contexts = browser.contexts()
      for (const context of contexts) {
         await context.close().catch(() => {})
      }
   }
}

export async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T | null> {
   let page: Page | null = null
   try {
      const browser = await ensureBrowser()
      page = await createPageFromBrowser(browser)
      return await fn(page)
   } catch (err) {
      handleError(err)
      return null
   } finally {
      if (page) {
         await page
            .context()
            .close()
            .catch(() => {})
      }
      logMemory('Context closed')
   }
}
