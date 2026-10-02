import PQueue from 'p-queue'
import type { Beatmap } from '../types/types.ts'
import { buildHeaders, fetchInnerGraphApi, hashes } from '../spotify-api.ts'
import type { SpotifySearchQueryResponse, TrackResponseWrapper } from '../types/SpotifyInnerApi.ts'
import { getToken } from './token.ts'
import { isArtistMatch, isTitleMatch } from '../utils/spotify-text.ts'
import { dbPlaylist } from '../db.ts'
import axios from 'axios'
import { dbTelemetry } from '../neon-db.ts'
import { logger } from '../logger.ts'

const log = logger.child({ module: 'playlistJob' })
const URIS_TO_ADD_BATCH_SIZE = 50
const jobQueue = new PQueue({ concurrency: 1 })

export function startPlaylistFill({ clientId, beatmaps }: { clientId: string; beatmaps: Beatmap[] }): void {
   jobQueue.add(async () => {
      try {
         await runPlaylistFillJob({ clientId, beatmaps })
      } catch (err) {
         log.error({ clientId, err }, 'playlist fill job failed')
         const processingPl = dbPlaylist.get(clientId)
         if (processingPl) {
            dbPlaylist.set(clientId, { ...processingPl, status: 'error', message: String(err) })
         }
      }
   })
}

// TODO if same errors occur just stop everything
async function runPlaylistFillJob({ clientId, beatmaps }: { clientId: string; beatmaps: Beatmap[] }): Promise<void> {
   const processingPl = dbPlaylist.get(clientId)
   if (!processingPl) throw new Error(`No playlist found for clientId: ${clientId}`)
   if (processingPl.status !== 'processing')
      throw new Error(`Playlist has wrong status for clientId: ${clientId}. Current status: ${processingPl.status}`)

   const foundUris: string[] = []
   for (const beatmap of beatmaps) {
      // prepare local copy of playlist
      const curPl = dbPlaylist.get(clientId)
      if (!curPl || curPl.status !== 'processing')
         throw new Error(
            `Something went wrong with the playlist for clientId ${clientId} when processing beatmap ${beatmap.Title} by ${beatmap.Artist}`,
         )
      let localPlCopy = { ...curPl }

      // search for track
      let uri = null
      try {
         uri = await searchTrack(beatmap)
         if (uri) {
            localPlCopy.found += 1
            foundUris.push(uri)
         } else {
            log.info({ clientId, beatmap }, 'track not found for beatmap')
            localPlCopy.notFound += 1
         }
      } catch (err) {
         localPlCopy.errored += 1
      } finally {
         localPlCopy.processed += 1
      }

      // add to playlist batch if we have enough or if it's the last beatmap
      if (foundUris.length > 0 && (foundUris.length >= URIS_TO_ADD_BATCH_SIZE || localPlCopy.processed === beatmaps.length)) {
         try {
            await addTracksToPlaylist(curPl.id, [...foundUris])
            localPlCopy.added += foundUris.length
         } catch (err) {
            log.error({ clientId, err }, 'failed to add tracks to playlist')
            localPlCopy.errored += foundUris.length
         } finally {
            foundUris.length = 0
         }
      }
      // update playlist in DB
      dbPlaylist.set(clientId, localPlCopy)
   }

   // mark playlist as filled
   const finalPl = dbPlaylist.get(clientId)
   if (!finalPl) throw new Error(`No playlist found for clientId: ${clientId} after processing`)

   if (finalPl.found === 0) {
      dbPlaylist.set(clientId, { ...finalPl, status: 'error', message: 'No tracks found for the provided beatmaps' })
      throw new Error('No tracks found for the provided beatmaps')
   } else {
      dbPlaylist.set(clientId, { ...finalPl, status: 'filled' })
      dbTelemetry
         .playlistFilled({
            playlistId: finalPl.id,
            clientId,
            added: finalPl.added,
            total: finalPl.total,
            errored: finalPl.errored,
         })
         .catch((err) => {
            log.warn({ clientId, err, plId: finalPl.id }, 'failed to send telemetry for playlist filled')
         })
   }
}

async function addTracksToPlaylist(playlistId: string, uris: string[]): Promise<void> {
   const token = await getToken()
   if (!token) throw new Error('No token available')
   await fetchInnerGraphApi({
      hash: hashes.addToPlaylist,
      operationName: 'addToPlaylist',
      token,
      variables: {
         newPosition: {
            fromUid: null,
            moveType: 'BOTTOM_OF_PLAYLIST',
         },
         playlistItemUris: uris,
         playlistUri: `spotify:playlist:${playlistId}`,
      },
   })
}

async function searchTrack(beatmap: Beatmap): Promise<string | null> {
   const token = await getToken()
   if (!token) throw new Error('No token available')

   const query = `${beatmap.ArtistUnicode || beatmap.Artist || ''} ${beatmap.TitleUnicode || beatmap.Title || ''}`.trim()

   try {
      const data = await fetchInnerGraphApi<SpotifySearchQueryResponse>({
         token,
         operationName: 'searchTopResultsList',
         hash: hashes.searchTopResultsList,
         variables: {
            includeAlbumPreReleases: false,
            includeArtistHasConcertsField: true,
            includeAudiobooks: false,
            includeAuthors: false,
            includeEpisodeContentRatingsV2: true,
            includePreReleases: true,
            isPrefix: null,
            limit: 5,
            numberOfTopResults: 5,
            offset: 0,
            query,
            sectionFilters: ['GENERIC', 'VIDEO_CONTENT'],
         },
      })

      const items = data?.searchV2?.topResultsV2?.itemsV2 ?? []
      const tracks = items.filter(
         (i): i is { item: TrackResponseWrapper; matchedFields?: string[] } => i.item.__typename === 'TrackResponseWrapper',
      )

      // filtering tracks to find real match instead of recommendations
      let selectedTrack: TrackResponseWrapper | null = null
      for (const track of tracks) {
         const titleMatched =
            isTitleMatch(beatmap.TitleUnicode, track.item.data.name) || isTitleMatch(beatmap.Title, track.item.data.name)

         const artistMatched = track.item.data.artists.items.some(
            (artist) =>
               isArtistMatch(beatmap.ArtistUnicode, artist.profile.name) || isArtistMatch(beatmap.Artist, artist.profile.name),
         )

         // TODO mark as low confidence
         // if only title or only artist matched, and not both
         // if 100% match
         // if substring match
         if (titleMatched || artistMatched) {
            selectedTrack = track.item
            break
         }
      }

      return selectedTrack?.data.uri ?? null
   } catch (err) {
      log.error({ query, err }, 'Error searching for beatmap')
      throw err
   }
}

export async function createPlaylist(): Promise<string> {
   const token = await getToken()
   if (!token) throw new Error('No token available')

   const customHeaders = {
      ...(await buildHeaders(token)),
      Accept: 'application/json',
   }
   const { data } = await axios.post<{ uri: string; revision: string }>(
      'https://spclient.wg.spotify.com/playlist/v2/playlist',
      {
         ops: [
            {
               kind: 'UPDATE_LIST_ATTRIBUTES',
               updateListAttributes: {
                  newAttributes: {
                     values: {
                        name: 'osu to spotify',
                        description: 'Generated by osu.yageey.me at ' + new Date().toLocaleDateString(),
                     },
                  },
               },
            },
         ],
      },
      { headers: customHeaders },
   )

   try {
      await axios.post(
         'https://spclient.wg.spotify.com/playlist/v2/user/313ylfw2p3xrcb5nsyubpkcxs4t4/rootlist/changes',
         {
            deltas: [
               {
                  ops: [
                     {
                        kind: 'ADD',
                        add: {
                           addFirst: true,
                           items: [
                              {
                                 uri: data.uri,
                                 attributes: { timestamp: Date.now().toString() },
                              },
                           ],
                        },
                     },
                  ],
                  info: { source: { client: 'WEBPLAYER' } },
               },
            ],
         },
         { headers: customHeaders },
      )
   } catch (err) {
      log.warn({ err }, 'failed to add playlist to rootlist (playlist still created)')
   }

   const uri = data?.uri
   const PREFIX = 'spotify:playlist:'
   if (typeof uri !== 'string' || !uri.startsWith(PREFIX)) {
      throw new Error(`Invalid playlist URI received: ${String(uri)}`)
   }
   const id = uri.slice(PREFIX.length)
   return id
}

export async function recoverStalePlaylists(): Promise<void> {
   for (const { clientId, data } of dbPlaylist.getAll()) {
      if (data.status === 'processing') {
         log.error({ clientId, plId: data.id }, 'stale processing -> error for playlist')
         dbPlaylist.set(clientId, { ...data, status: 'error', message: 'Server restarted during processing' })
      }
   }
}
