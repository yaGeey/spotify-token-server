import z from 'zod'

export const beatmapsSchema = z
   .array(
      z.object({
         Title: z.string().nullish(),
         TitleUnicode: z.string().nullish(),
         Artist: z.string().nullish(),
         ArtistUnicode: z.string().nullish(),
      }),
   )
   .min(1, { message: 'At least one beatmap is required' })
export type Beatmap = z.infer<typeof beatmapsSchema>[number]

type PlaylistCounters = {
   notFound: number
   total: number
   processed: number
   found: number
   errored: number
   added: number
}
export type PlaylistStatus = { id: string } & PlaylistCounters &
   (
      | {
           status: 'processing' | 'filled' | 'ready'
        }
      | {
           status: 'error'
           message: string
        }
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
