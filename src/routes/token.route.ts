import { Router } from 'express'
import { verifyAuthorizationHeader } from '../middlewares.ts'
import { getToken } from '../services/token.ts'

export const tokenRouter = Router()
tokenRouter.use(verifyAuthorizationHeader)

tokenRouter.get('/token', async (req, res) => {
   const token = await getToken()
   if (!token) return res.status(500).json({ error: 'Failed to obtain token' })
   return res.json(token)
})
