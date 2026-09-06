import express from 'express'
import 'dotenv/config'
import PQueue from 'p-queue'
import { store } from './storage.js'
import { handleError, closeContexts } from './browser.js'
import { logMemory } from './utils.js'
import './cronjobs.js'
import { proxyRouter } from './routes/proxy.route.js'
import { hashesRouter } from './routes/hashes.route.js'
import { tokenRouter } from './routes/token.route.js'

const app = express()
export const queue: PQueue = new PQueue({ concurrency: 1 })

app.use((req, res, next) => {
   logMemory(`--> Start ${req.method} ${req.url}`)
   res.on('finish', () => logMemory(`<-- End ${req.method} ${req.url}`))
   next()
})

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

app.use(tokenRouter)
app.use(hashesRouter)
app.use(proxyRouter)

// middleware --next-> failed route --next(err?)-> error handler
app.use(async (err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
   await closeContexts(store.browser)
   const details = handleError(err)
   if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error', details })
   }
})

const portRaw = process.env.PORT ?? '3000'
const PORT = Number.parseInt(portRaw, 10)
app.listen(3000, '0.0.0.0', () => {
   console.log(`Server listening on 0.0.0.0:${PORT}`)
})

process.on('unhandledRejection', (reason) => {
   console.error('💥 Unhandled Promise Rejection:', reason)
})

process.on('uncaughtException', (err) => {
   console.error('💥 Uncaught Exception:', err)
})
