import { withPage } from '../browser.ts'
import { logger } from '../logger.ts'
import { queue } from '../queue.ts'
import { store, type TokenResponse, type AccessTokenResponse } from '../storage.ts'

const log = logger.child({ module: 'tokenService' })

function isTokenValid(): boolean {
   return !!(
      store.access &&
      store.access.accessTokenExpirationTimestampMs > Date.now() &&
      store.client &&
      store.client.expiresAt > Date.now()
   )
}

export async function getToken(): Promise<TokenResponse | null> {
   // return token if valid
   if (isTokenValid()) {
      return { access: store.access!, client: store.client! } satisfies TokenResponse
   }

   const result = await queue.add(
      async () => {
         // if there was a request before, check it's result before making new one
         if (isTokenValid()) {
            return { access: store.access!, client: store.client! } satisfies TokenResponse
         }

         return await withPage<TokenResponse>(async (page) => {
            // access token
            const accessTokenPromise = page
               .waitForResponse(async (res) => res.url().includes('https://open.spotify.com/api/token') && res.status() === 200)
               .then(async (res) => res.json() as Promise<AccessTokenResponse>)

            // client token
            const clientTokenPromise = page
               .waitForResponse(
                  async (res) => res.url().includes('https://clienttoken.spotify.com/v1/clienttoken') && res.status() === 200,
               )
               .then(async (res) => {
                  const json = await res.json().catch(() => null)
                  const req = res.request()
                  const payload = req.postDataJSON()

                  return {
                     ...json.granted_token,
                     client_version: payload.client_data.client_version,
                     // headers: req.headers(),
                  }
               })

            // get tokens
            const [accessTokenRes, clientTokenRes] = await Promise.all([
               accessTokenPromise,
               clientTokenPromise,
               page.goto('https://open.spotify.com/', { waitUntil: 'domcontentloaded', timeout: 60000 }),
            ])
            log.info({ accessTokenRes, clientTokenRes }, 'got new tokens')

            // format data
            store.access = accessTokenRes
            store.client = {
               expiresAt: Date.now() + clientTokenRes.refresh_after_seconds * 1000,
               token: clientTokenRes.token,
               version: clientTokenRes.client_version,
            }
            // store.headers = clientTokenRes.headers
            return { access: store.access!, client: store.client! } satisfies TokenResponse
         })
      },
      { priority: 1 },
   )
   return result
}
