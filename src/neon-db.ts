import { neon } from '@neondatabase/serverless'
const sql = neon(process.env.NEON_DB_URL as string)

const isDev = process.env.NODE_ENV === 'development'

export const dbTelemetry = {
   playlistFilled: async ({
      playlistId,
      clientId,
      added,
      total,
      errored,
   }: {
      playlistId: string
      clientId: string
      added: number
      total: number
      errored: number
   }) => {
      if (isDev) return
      await sql`
         INSERT INTO fo_playlists (playlist_id, session_id, added, total, errored)
         VALUES (${playlistId}, ${clientId}, ${added}, ${total}, ${errored})
         RETURNING id
      `
   },
}
