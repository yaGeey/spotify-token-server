import { randomUUID } from 'node:crypto'
import { pino } from 'pino'
import { pinoHttp } from 'pino-http'

const isDev = process.env.NODE_ENV === 'development'
const HIDDEN_QUERY_KEYS = new Set(['url', 'exp', 'sig'])

function sanitizeQuery(query: unknown): Record<string, unknown> | undefined {
   if (!query || typeof query !== 'object' || Array.isArray(query)) return undefined
   const entries = Object.entries(query as Record<string, unknown>).filter(([key]) => !HIDDEN_QUERY_KEYS.has(key))
   return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

const serializers = {
   err: (e: any) => {
      if (!e || typeof e !== 'object') return { value: e }
      return {
         type: e.type ?? e.name,
         message: e.message,
         stack: e.stack,
         code: e.code,
         status: e.status ?? e.response?.status,
         data: e.response?.data,
      }
   },
   req: (req: any) => ({
      id: req?.id,
      method: req?.method,
      path: String(req?.url ?? '').split('?')[0],
      query: sanitizeQuery(req?.query),
   }),
   res: (res: any) => ({ statusCode: res?.statusCode }),
}

export const logger = pino({
   level: process.env.LOG_LEVEL ?? 'info',
   timestamp: pino.stdTimeFunctions.isoTime,
   serializers,
})

export const httpLogger = pinoHttp({
   logger,
   genReqId: (req, res) => {
      const incoming = req.headers['x-request-id']
      const id = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID()
      res.setHeader('X-Request-Id', id)
      return id
   },
   customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
   autoLogging: { ignore: (req) => req.url === '/' || req.url === '/favicon.ico' },
   serializers,
})
