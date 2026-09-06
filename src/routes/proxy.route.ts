import { Router } from 'express'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { Readable } from 'node:stream'
import cors from 'cors'

export const proxyRouter = Router()
proxyRouter.use(cors({ origin: '*' }))

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

proxyRouter.use((req, res, next) => {
   const { url, exp, sig } = req.query
   if (!url || !exp || !sig) {
      return res.status(400).json({ error: 'Missing required query parameters: url, exp, sig' })
   }

   const expNum = Number(exp)
   if (isNaN(expNum) || expNum < Math.floor(Date.now() / 1000)) {
      return res.status(403).json({ error: 'Invalid or expired exp parameter' })
   }

   const expectedSig = createHmac('sha256', process.env.API_SECRET!).update(`${url}${exp}`).digest('hex')
   const sigBuffer = Buffer.from(sig as string, 'hex')
   const expectedSigBuffer = Buffer.from(expectedSig, 'hex')
   if (sigBuffer.length !== expectedSigBuffer.length || !timingSafeEqual(sigBuffer, expectedSigBuffer)) {
      return res.status(403).json({ error: 'Invalid signature' })
   }
   next()
})

proxyRouter.get('/proxy', async (req, res, next) => {
   const targetUrl = req.query.url as string
   if (!targetUrl) return res.status(400).json({ message: 'Missing url parameter' })

   try {
      new URL(targetUrl)
   } catch {
      return res.status(400).json({ error: 'Invalid url parameter' })
   }

   try {
      const forwardHeaders: Record<string, string> = {}
      for (const h of ['authorization', 'referer']) {
         const v = req.get(h)
         if (v) forwardHeaders[h] = v
      }

      const upstreamResponse = await fetch(targetUrl, {
         redirect: 'follow',
         headers: {
            ...forwardHeaders,
            'User-Agent':
               'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
         },
      })

      upstreamResponse.headers.forEach((val, key) => {
         if (!HOP_BY_HOP_HEADERS.includes(key.toLowerCase())) {
            res.setHeader(key, val)
         }
      })
      res.setHeader('Access-Control-Expose-Headers', '*')
      res.status(upstreamResponse.status)

      if (upstreamResponse.body) Readable.fromWeb(upstreamResponse.body as any).pipe(res)
      else res.end()
   } catch (err) {
      next(err)
   }
})
