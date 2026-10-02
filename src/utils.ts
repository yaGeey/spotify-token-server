import { logger } from './logger.ts'

const log = logger.child({ module: 'utils' })

export const delay = (ms: number, jitter = 500) => new Promise((resolve) => setTimeout(resolve, ms + Math.random() * jitter))

export function logMemory(label: string = '') {
   const usage = process.memoryUsage()
   const rss = Math.round(usage.rss / 1024 / 1024)
   const heap = Math.round(usage.heapUsed / 1024 / 1024)
   const external = Math.round(usage.external / 1024 / 1024)

   log.debug({ label, rss, heap, external }, 'memory usage')
}
