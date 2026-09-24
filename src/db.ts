import Database from 'better-sqlite3'
import type { PlaylistStatus, TokenRow } from './types/types.ts'
const sql = (strings: TemplateStringsArray, ...values: any[]): string => String.raw({ raw: strings }, ...values)

const db: Database.Database = new Database('playlists.db')
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
const setPlStmt = db.prepare(sql`
  INSERT INTO playlists (clientId, data) VALUES (?, ?)
  ON CONFLICT(clientId) DO UPDATE SET data = excluded.data
`)

export const dbPlaylist = {
   get: (clientId: string): PlaylistStatus | null => {
      const row = getPlStmt.get({ clientId }) as { data: string } | undefined
      if (!row) return null
      return JSON.parse(row.data) as PlaylistStatus
   },

   set: (clientId: string, value: PlaylistStatus): void => {
      const jsonData = setPlStmt.run(clientId, JSON.stringify(value))
   },
}

// --- TOKENS ---
// db.exec(sql`
//    CREATE TABLE IF NOT EXISTS accessToken (
//       id INTEGER PRIMARY KEY CHECK (id = 1)
//       token TEXT PRIMARY KEY,
//       expiresAt INTEGER NOT NULL,
//       clientId TEXT NOT NULL
//    );
//    CREATE TABLE IF NOT EXISTS clientToken (
//       id INTEGER PRIMARY KEY CHECK (id = 1)
//       token TEXT PRIMARY KEY,
//       expiresAt INTEGER NOT NULL,
//       version TEXT NOT NULL
//    );
// `)
// db.exec(sql`
//    INSERT OR IGNORE INTO accessToken (id, token, expiresAt, clientId) VALUES (1, '', 0, '');
//    INSERT OR IGNORE INTO clientToken (id, token, expiresAt, version) VALUES (1, '', 0, '');
// `)

// const getAccessTokenStmt = db.prepare(sql`SELECT * FROM accessToken`)
// const getClientTokenStmt = db.prepare(sql`SELECT * FROM clientToken`)
// const updateAccessTokenStmt = db.prepare(sql`UPDATE accessToken SET token = @token, expiresAt = @expiresAt, clientId = @clientId WHERE id = 1`)
// const updateClientTokenStmt = db.prepare(sql`UPDATE clientToken SET token = @token, expiresAt = @expiresAt, version = @version WHERE id = 1`)

// export const dbTokens = {
//    get: (name: 'access' | 'client'): TokenRow | null => {
//       let row: TokenRow | undefined 
//       if (name === 'access') row  = 
//    },
//    set: ({ ...data }: TokenRow): void => {
//       setTokenStmt.run({ ...data })
//    },
// }