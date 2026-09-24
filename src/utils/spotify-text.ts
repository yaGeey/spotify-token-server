const sanitize = (str?: string | null): string => {
   if (!str) return ''
   return (
      str
         .toLowerCase()
         // Remove brackets with typical metadata like (TV Size), [Cut Ver.], (feat. ...)
         .replace(/[\(\[\{].*?[\)\]\}]/g, '')
         // Replace punctuation with spaces to safely check word boundaries
         .replace(/[^\p{L}\p{N}\s]/gu, ' ')
         .replace(/\s+/g, ' ')
         .trim()
   )
}

// Check if tokenized string 'needle' exists inside 'haystack' as isolated words
const matchesWordBoundary = (haystack: string, needle: string): boolean => {
   if (!haystack || !needle) return false
   if (haystack === needle) return true

   // Escape special regex chars
   const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
   // Match as a standalone word / sequence of words
   const regex = new RegExp(`(^|\\s)${escaped}(\\s|$)`, 'i')
   return regex.test(haystack)
}

export const isTitleMatch = (rawBeatmapTitle?: string | null, rawTrackName?: string | null): boolean => {
   const bTitle = sanitize(rawBeatmapTitle)
   const tTitle = sanitize(rawTrackName)

   if (!bTitle || !tTitle) return false
   if (bTitle === tTitle) return true

   // Substring match with word boundaries to avoid matching parts of other words
   return matchesWordBoundary(tTitle, bTitle) || matchesWordBoundary(bTitle, tTitle)
}

export const isArtistMatch = (rawBeatmapArtist?: string | null, rawSpotifyArtist?: string | null): boolean => {
   const bArtist = sanitize(rawBeatmapArtist)
   const sArtist = sanitize(rawSpotifyArtist)

   if (!bArtist || !sArtist) return false
   if (bArtist === sArtist) return true

   // Handles collabs: check if the individual Spotify artist is isolated inside the beatmap artist string
   // e.g., "camellia" inside "camellia vs akira complex"
   if (matchesWordBoundary(bArtist, sArtist)) return true

   // Vice versa: if beatmap artist is contained inside Spotify artist name
   if (matchesWordBoundary(sArtist, bArtist)) return true

   return false
}
