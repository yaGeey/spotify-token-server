import { dbPlaylist } from "../db.ts"
import { createPlaylist } from "./playlistJob.ts"

const createInFlight = new Map<string, Promise<string>>()
export async function getOrCreatePlaylist(clientId: string, regenerate = false) {
   const existing = dbPlaylist.get(clientId)
   if (existing && !regenerate) return { id: existing.id, created: false }
   
   const inFlight = createInFlight.get(clientId)
   if (inFlight) return { id: await inFlight, created: false }

   const pl = createPlaylist()
   createInFlight.set(clientId, pl)
   try {
      const id = await pl
      dbPlaylist.set(clientId, { id, status: 'ready', notFound: 0, total: 0, processed: 0, found: 0, errored: 0, added: 0 })
      return { id, created: true }
   } finally {
      createInFlight.delete(clientId)
   }
}