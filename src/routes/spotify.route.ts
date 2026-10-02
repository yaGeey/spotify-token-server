import { Router } from 'express'
import z from 'zod'
import { beatmapsSchema } from '../types/types.ts'
import { getSpotifyToken, verifySignedUrl } from '../middlewares.ts'
import { dbPlaylist } from '../db.ts'
import { createPlaylist, startPlaylistFill } from '../services/playlistJob.ts'
import { getOrCreatePlaylist } from '../services/createPlaylistJob.ts'

export const spotifyRouter = Router()

spotifyRouter.post('/spotify/playlist', verifySignedUrl, getSpotifyToken, async (req, res) => {
   const validationRes = z
      .object({
         'x-client-id': z.string(),
         regenerate: z
            .enum(['true', 'false'])
            .optional()
            .transform((val) => val === 'true'),
      })
      .safeParse({
         'x-client-id': req.headers['x-client-id'],
         regenerate: req.query['regenerate'],
      })
   if (!validationRes.success) {
      return res.status(400).json({ message: 'Validation failed', details: z.treeifyError(validationRes.error) })
   }
   const { 'x-client-id': clientId, regenerate } = validationRes.data

   try {
      const { id, created } = await getOrCreatePlaylist(clientId, regenerate)
      return res.status(created ? 201 : 200).json({ id })
   } catch (err) {
      return res.status(500).json({
         message: 'Failed to create playlist',
         details: err instanceof Error ? err.message : String(err),
      })
   }
})

spotifyRouter.post('/spotify/playlist/:playlistId', getSpotifyToken, async (req, res) => {
   // FIXME setup Nginx too
   // TODO s:
   // check if everything existed, add in DB map for map id to spotify track id, and check if the map is already in the playlist before adding it again
   // test concurrency
   // роз'єднати browser logs and server logs шоб записувались в окремі файли
   // додати db щоб все було persistance

   const validationRes = z
      .object({
         headers: z.object({ 'x-client-id': z.string() }),
         params: z.object({ playlistId: z.string() }),
         beatmaps: beatmapsSchema,
      })
      .safeParse({
         headers: req.headers,
         params: req.params,
         beatmaps: req.body,
      })
   if (!validationRes.success) {
      return res.status(400).json({ message: 'Validation failed', details: z.treeifyError(validationRes.error) })
   }
   const { headers, params, beatmaps } = validationRes.data
   const clientId = headers['x-client-id']

   // check playlist from db
   const readyPl = dbPlaylist.get(clientId)
   if (!readyPl || readyPl?.id !== params.playlistId) {
      return res.status(403).json({ message: 'Invalid playlistId for the given clientId' })
   }
   if (readyPl.status !== 'ready') {
      return res.status(400).json({ message: 'Playlist is not in a ready state. Status: ' + readyPl.status }) // or 409 error?
   }

   // start
   dbPlaylist.set(clientId, { ...readyPl, status: 'processing', total: beatmaps.length })
   startPlaylistFill({ clientId, beatmaps })

   const updatedPl = dbPlaylist.get(clientId)
   res.status(202).json(updatedPl)
})

spotifyRouter.get('/spotify/playlist', verifySignedUrl, async (req, res) => {
   const validationRes = z.object({ 'x-client-id': z.string() }).safeParse(req.headers)
   if (!validationRes.success) {
      return res.status(400).json({ message: 'Validation failed', details: z.treeifyError(validationRes.error) })
   }
   const clientId = validationRes.data['x-client-id']

   const pl = dbPlaylist.get(clientId)
   if (!pl) {
      return res.status(404).json({ message: 'No playlist found for the given clientId' })
   }
   res.json(pl)
})
