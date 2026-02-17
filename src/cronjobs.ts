import nodeCron from 'node-cron'
import { queue } from './index.js'
import { updateAllHashes } from './hashHandlers.js'
import { handleError, restartBrowser } from './browser.js'

nodeCron.schedule('0 3 * * *', () => {
   const randomDelay = Math.floor(Math.random() * 1000 * 60 * 60 * 2)
   setTimeout(async () => {
      try {
         // restart browser to prevent memory leaks and other issues
         await queue.add(async () => await restartBrowser())

         // update hashes 
         const hashes = await updateAllHashes()
         if (Object.keys(hashes).some((key) => hashes[key] === null)) {
            console.error('cron: Failed to update some hashes', hashes)
         } else {
            console.log('✅ Cron: All hashes updated successfully')
         }
      } catch (err) {
         handleError(err)
      }
   }, randomDelay)
})
