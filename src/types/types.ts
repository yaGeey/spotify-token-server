type PlaylistCounters = {
   notFound: number
   total: number
   processed: number
   found: number
   errored: number
}
export type PlaylistStatus = { playlistId: string } & (
   | {
        status: 'ready'
     }
   | ({
        status: 'processing' | 'filled'
     } & PlaylistCounters)
   | ({
        status: 'error'
        message: string
     } & PlaylistCounters)
)

export type TokenRow = {
   token: string
   expiresAt: number
} & (
   | {
        name: 'access'
        clientId: string
     }
   | {
        name: 'client'
        version: string
     }
)

export type AccessTokenResponse = { clientId: string; token: string; expiresAt: number }
export type ClientTokenResponse = { expiresAt: number; token: string; version: string }

export type TokenResponse = {
   accessToken: AccessTokenResponse
   clientToken: ClientTokenResponse
}
