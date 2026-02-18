export function generateRandomString(maxLength: number): string {
   const chars = 'abcdefghijklmnopqrstuvwxyz'
   const length = Math.floor(Math.random() * maxLength) + 1
   let result = ''

   for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
   }

   return result
}

export const delay = (ms: number, jitter = 500) => new Promise((resolve) => setTimeout(resolve, ms + Math.random() * jitter))

export function logMemory(label: string = '') {
   const usage = process.memoryUsage()
   // RSS (Resident Set Size) — це загальний обсяг пам'яті процесу,
   // включаючи C++ об'єкти (Chromium), що критично для Playwright.
   const rss = Math.round(usage.rss / 1024 / 1024)
   const heap = Math.round(usage.heapUsed / 1024 / 1024)
   const external = Math.round(usage.external / 1024 / 1024)

   console.log(`[MEM] ${label} -> RSS: ${rss} MB | Heap: ${heap} MB | Ext: ${external} MB`)
}