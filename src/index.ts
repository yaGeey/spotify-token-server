import express from 'express'
import 'dotenv/config'
import { logger, httpLogger } from './logger.ts'
import { store } from './storage.js'
import { handleError, closeContexts, killBrowser } from './browser.js'
import './cronjobs.js'
import { proxyRouter } from './routes/proxy.route.js'
import { hashesRouter } from './routes/hashes.route.js'
import { tokenRouter } from './routes/token.route.js'
import { spotifyRouter } from './routes/spotify.route.js'
import { recoverStalePlaylists } from './services/playlistJob.ts'
import './secrets.ts'
export { queue } from './queue.ts'

const app = express()
app.use(httpLogger)
app.use(express.json({ limit: '50mb' }))

app.get('/', (req, res) => {
   res.send('alive')
})

// TODO give userId
// TODO give sha codes on 401 / !412! error on client. separate route
app.use(proxyRouter)
app.use(spotifyRouter)
app.use(tokenRouter)
app.use(hashesRouter)

// middleware --next-> failed route --next(err?)-> error handler
app.use(async (err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
   await closeContexts(store.browser)
   const details = handleError(err)
   if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error', details })
   }
})

recoverStalePlaylists()

const portRaw = process.env.PORT ?? '8080'
const PORT = Number.parseInt(portRaw, 10)
app.listen(PORT, '0.0.0.0', () => {
   logger.info({ port: PORT, nodeEnv: process.env.NODE_ENV ?? 'development' }, 'server.started')
})

process.on('unhandledRejection', (reason) => {
   logger.error({ err: reason }, 'process.unhandled_rejection')
})

process.on('uncaughtException', (err) => {
   logger.fatal({ err }, 'process.uncaught_exception')
   process.exit(1)
})

// graceful shutdown on SIGINT (Ctrl+C) or SIGTERM
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
   process.on(signal, async () => {
      logger.info({ signal }, 'process.shutdown')
      await killBrowser(store.browser)
      process.exit(0)
   })
}