import Database from 'better-sqlite3'
import type { PlaylistStatus, TokenRow } from './types/types.ts'
import { logger } from './logger.ts'
const sql = (strings: TemplateStringsArray, ...values: any[]): string => String.raw({ raw: strings }, ...values)
const log = logger.child({ module: 'db' })

const dbPath = process.env.DB_PATH ?? 'playlists.db'
const db: Database.Database = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')

// --- PLAYLISTS ---
db.exec(sql`
   CREATE TABLE IF NOT EXISTS playlists (
      clientId TEXT PRIMARY KEY,
      data TEXT NOT NULL
   );
`)

const getPlStmt = db.prepare(sql`SELECT * FROM playlists WHERE clientId = @clientId`)
const getAllPlStmt = db.prepare(sql`SELECT * FROM playlists`)
const setPlStmt = db.prepare(sql`
  INSERT INTO playlists (clientId, data) VALUES (?, ?)
  ON CONFLICT(clientId) DO UPDATE SET data = excluded.data
`)

export const dbPlaylist = {
   get: (clientId: string): PlaylistStatus | null => {
      const row = getPlStmt.get({ clientId }) as { data: string } | undefined
      if (!row) return null
      return parsePlRow(clientId, row.data)
   },

   set: (clientId: string, value: PlaylistStatus): void => {
      setPlStmt.run(clientId, JSON.stringify(value))
   },

   getAll: (): { clientId: string; data: PlaylistStatus }[] => {
      const rows = getAllPlStmt.all() as { clientId: string; data: string }[]
      return rows.flatMap((row) => {
         const parsed = parsePlRow(row.clientId, row.data)
         if (!parsed) {
            // TODO maybe delete the corrupted row from db? or just log and skip
            return []
         }
         return [{ clientId: row.clientId, data: parsed }]
      })
   },
}

function parsePlRow(clientId: string, raw: string): PlaylistStatus | null {
   try {
      return JSON.parse(raw) as PlaylistStatus
   } catch (error) {
      log.error({ clientId, raw, err: error }, 'failed to parse playlist JSON')
      return null
   }
}