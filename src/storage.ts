import type { Page } from 'playwright'

export type AccessTokenResponse = { clientId: string; accessToken: string; accessTokenExpirationTimestampMs: number }
export type ClientTokenResponse = { expiresAt: number; token: string; version: string }

export type TokenResponse = {
   access: AccessTokenResponse
   client: ClientTokenResponse
}

export type Operation = {
   name: string
   url: string
   action?: (page: Page) => Promise<void>
}
type Hashes = Record<string, string | null>
export const store = {
   access: null as AccessTokenResponse | null,
   client: null as ClientTokenResponse | null,
   hashes: {} as Hashes,
}
