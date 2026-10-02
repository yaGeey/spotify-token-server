import type { RequestHandler } from 'express'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { getToken } from './services/token.ts'
import z from 'zod'

const resourcePath = (raw: string): string => {
   try {
      return new URL(raw, process.env.SELF_URL_BASE).pathname
   } catch (error) {
      return raw.split('?')[0] ?? raw
   }
}

export const verifySignedUrl: RequestHandler = (req, res, next) => {
   const validationRes = z
      .object({
         url: z.string(),
         exp: z.string().transform((val) => {
            const num = Number(val)
            if (isNaN(num) || !Number.isFinite(num)) throw new Error('exp must be a number')
            return num
         }),
         sig: z.string(),
      })
      .safeParse(req.query)
   if (!validationRes.success) {
      return res.status(400).json({ message: 'Validation failed', details: z.treeifyError(validationRes.error) })
   }
   const { url, exp, sig } = validationRes.data

   const now = Math.floor(Date.now() / 1000)
   if (exp < now) {
      return res.status(403).json({ error: 'Expired exp parameter' })
   }
   // if (exp > now + MAX_TTL_SECONDS)
   // return res.status(403).json({ error: 'exp is too far in the future' })
   // if (resourcePath(url) !== req.path) {
   //    return res.status(403).json({ error: 'Signature does not match request path' })
   // }

   const expectedSig = createHmac('sha256', process.env.API_SECRET!).update(`${url}${exp}`).digest('hex')
   const sigBuffer = Buffer.from(sig as string, 'hex')
   const expectedSigBuffer = Buffer.from(expectedSig, 'hex')
   if (sigBuffer.length !== expectedSigBuffer.length || !timingSafeEqual(sigBuffer, expectedSigBuffer)) {
      return res.status(403).json({ error: 'Invalid signature' })
   }
   next()
}

export const verifyAuthorizationHeader: RequestHandler = (req, res, next) => {
   if (req.headers['authorization'] !== process.env.API_SECRET) {
      return res.status(403).json({ error: 'Wrong Secret Key' })
   }
   next()
}

export const getSpotifyToken: RequestHandler = async (req, res, next) => {
   const token = await getToken()
   if (!token) return res.status(500).json({ message: 'Failed to obtain token' })
   res.locals.token = token
   next()
}
