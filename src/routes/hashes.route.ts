import { Router } from 'express'
import { withPage } from '../browser.js'
import { updateAllHashes, operations, updateHash } from '../hashHandlers.js'
import { queue } from '../index.js'
import { store } from '../storage.js'
import { delay } from '../utils.js'

export const hashesRouter = Router()

// TODO handle 404
hashesRouter.get('/hashes', (req, res) => {
   const raw = String(req.query.names || '')
   if (raw) {
      const names = raw.split(',')
      const filtered = Object.fromEntries(Object.entries(store.hashes).filter(([key]) => names.includes(key)))
      res.json({ requested: filtered, all: store.hashes })
   } else {
      res.json({ requested: {}, all: store.hashes })
   }
})

hashesRouter.put('/hashes', async (req, res) => {
   const raw = String(req.query.names || '')
   let tempHash = store.tempHashes

   const names = raw ? raw.split(',') : null

   if (!names) {
      // update all
      tempHash = await updateAllHashes()
   } else {
      // update selected
      for (const name of names) {
         const op = operations.find((o) => o.names.includes(name))
         if (!op || op.names.every((name) => tempHash[name])) {
            console.log(`Skipping ${name}`)
            continue
         }

         const hash = await queue.add(() => withPage((page) => updateHash(page, op)))
         // Record hash for ALL names in the operation
         for (const opName of op.names) tempHash[opName] = hash
         await delay(800)
      }
      const hashesAmount = Object.keys(tempHash).length
      if (hashesAmount === 0) {
         return res.status(400).json({ error: 'No valid operation names provided' })
      }
      if (names.some((name) => !operations.some((op) => op.names.includes(name)))) {
         return res.status(404).json({
            error: 'Some operation names were invalid',
            details: { raw, hashes: tempHash },
         })
      }
   }

   if (Object.keys(tempHash).some((key) => tempHash[key] === null)) {
      console.error('Failed to update some hashes', tempHash)
      return res.status(502).json({ error: 'Failed to update some hashes', details: tempHash })
   }

   store.tempHashes = {}
   Object.assign(store.hashes, tempHash)
   const requested = Object.fromEntries(Object.entries(store.hashes).filter(([key, value]) => names?.includes(key) && value))
   res.json({ requested, all: store.hashes })
})
