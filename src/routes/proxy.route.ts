import { Router } from 'express'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import cors from 'cors'
import { verifySignedUrl } from '../middlewares.ts'

export const proxyRouter = Router()
proxyRouter.use(
   cors({
      origin: ['http://localhost:3000', 'https://osu.yageey.me'],
      methods: ['GET', 'HEAD', 'OPTIONS'],
      exposedHeaders: ['*'],
   }),
)

const HOP_BY_HOP_HEADERS = [
   'content-encoding',
   'content-length',
   'transfer-encoding',
   'connection',
   'keep-alive',
   'proxy-authenticate',
   'proxy-authorization',
   'te',
   'trailer',
   'upgrade',
]

proxyRouter.get('/proxy', verifySignedUrl, async (req, res, next) => {
   const targetUrl = req.query.url as string
   if (!targetUrl) return res.status(400).json({ error: 'Missing url parameter' })

   try {
      new URL(targetUrl)
   } catch {
      return res.status(400).json({ error: 'Invalid url parameter' })
   }

   const controller = new AbortController()
   const onClose = () => {
      if (!res.writableFinished) controller.abort()
   }
   req.on('close', onClose)
   res.on('close', onClose)

   try {
      const forwardHeaders: Record<string, string> = {}
      for (const h of ['authorization', 'referer']) {
         const v = req.get(h)
         if (v) forwardHeaders[h] = v
      }

      const upstreamResponse = await fetch(targetUrl, {
         redirect: 'follow',
         signal: controller.signal,
         headers: {
            ...forwardHeaders,
            'User-Agent':
               'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
         },
      })

      upstreamResponse.headers.forEach((val, key) => {
         const lower = key.toLowerCase()
         if (!HOP_BY_HOP_HEADERS.includes(lower) && !lower.startsWith('access-control-')) {
            res.setHeader(key, val)
         }
      })
      res.setHeader('Access-Control-Expose-Headers', '*')
      res.status(upstreamResponse.status)

      if (!upstreamResponse.body) {
         res.end()
         return
      }

      try {
         await pipeline(Readable.fromWeb(upstreamResponse.body as any), res)
      } catch (pipelineErr: any) {
         if (res.writableFinished || res.destroyed || controller.signal.aborted) return
         const code = pipelineErr?.cause?.code ?? pipelineErr?.code
         const msg = String(pipelineErr?.message ?? '')
         if (
            code === 'ERR_HTTP2_STREAM_ERROR' ||
            code === 'ECONNRESET' ||
            code === 'EPIPE' ||
            code === 'ERR_STREAM_PREMATURE_CLOSE' ||
            msg.includes('terminated') ||
            msg.includes('abort')
         ) {
            return
         }
         next(pipelineErr)
      }
   } catch (err: any) {
      if (res.writableFinished || res.destroyed || controller.signal.aborted) return
      if (err?.name === 'AbortError') return
      next(err)
   } finally {
      req.off('close', onClose)
      res.off('close', onClose)
   }
})
