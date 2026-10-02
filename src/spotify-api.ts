import axios from 'axios'
import type { TokenResponse } from './storage.ts'

export const hashes = {
   addToPlaylist: '47b2a1234b17748d332dd0431534f22450e9ecbb3d5ddcdacbd83368636a0990',
   fetchPlaylist: 'a65e12194ed5fc443a1cdebed5fabe33ca5b07b987185d63c72483867ad13cb4',
   searchTopResultsList: '12d940b3f7381506a82ff5382eb59b0ed65118656e6bcdfbe4cebc528f75d29d',
} as const

const headers = {
   'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
   Origin: 'https://open.spotify.com',
   Referer: 'https://open.spotify.com/',
   'Sec-Ch-Ua': '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
   'Sec-Ch-Ua-Mobile': '?0',
   'Sec-Ch-Ua-Platform': '"Windows"',
   'App-Platform': 'WebPlayer',
   Accept: 'application/json',
   'Content-Type': 'application/json;charset=UTF-8',
   'accept-language': 'en',
} as const

export const buildHeaders = async (t: TokenResponse) => {
   return {
      ...headers,
      Authorization: `Bearer ${t.access.accessToken}`,
      'Client-Token': t.client.token,
      'Spotify-App-Version': t.client.version,
   }
}

export async function fetchInnerGraphApi<T extends Record<string, any>>({
   token,
   operationName,
   variables,
   hash,
}: {
   token: TokenResponse
   operationName: string
   variables: Record<string, any>
   hash: string
}) {
   const { data } = await axios.post<{ data: T }>(
      'https://api-partner.spotify.com/pathfinder/v2/query',
      {
         variables,
         operationName,
         extensions: {
            persistedQuery: {
               version: 1,
               sha256Hash: hash,
            },
         },
      },
      {
         headers: await buildHeaders(token),
      },
   )
   if (data?.data) {
      const key = Object.keys(data.data)[0]
      const value = data.data[key as keyof typeof data.data]
      if ('__typename' in value && value.__typename === 'GenericError') {
         throw new Error(
            JSON.stringify({
               ...data.data,
               operationName,
               variables,
            }),
         )
      }
   }
   return data.data
}
