import { logger } from "./logger.ts"

const REQUIRED_SECRETS = ['API_SECRET', 'SP_DC', 'SP_KEY', 'NEON_DB_URL'] as const

const missingSecrets = REQUIRED_SECRETS.filter((key) => !process.env[key] || process.env[key]?.trim() === '')

if (missingSecrets.length > 0) {
   logger.fatal({ missingSecrets }, 'Missing required secrets in environment variables')
   process.exit(1)
}
