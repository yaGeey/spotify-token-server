import type { RequestHandler } from 'express'
import { createHmac, timingSafeEqual } from 'node:crypto'

export const verifySignedUrl: RequestHandler = (req, res, next) => {
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
}

export const verifyAuthorizationHeader: RequestHandler = (req, res, next) => {
   if (req.headers['authorization'] !== process.env.API_SECRET) {
      return res.status(403).json({ error: 'Wrong Secret Key' })
   }
   next()
}
