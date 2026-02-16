export function generateRandomString(maxLength: number): string {
   const chars = 'abcdefghijklmnopqrstuvwxyz'
   const length = Math.floor(Math.random() * maxLength) + 1
   let result = ''

   for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
   }

   return result
}

export const delay = (ms: number, jitter = 500) => new Promise((resolve) => setTimeout(resolve, ms + Math.random() * jitter))
