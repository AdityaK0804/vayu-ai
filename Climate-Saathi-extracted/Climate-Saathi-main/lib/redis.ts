import Redis from 'ioredis'

const globalForRedis = globalThis as unknown as { redis: Redis | undefined }

export const redis: Redis | null = (() => {
  const url = process.env.REDIS_URL
  if (!url) return null          // Redis optional — falls back to direct ML call
  if (globalForRedis.redis) return globalForRedis.redis
  const tls = url.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined
  const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, tls })
  client.on('error', () => {})   // swallow connection errors — Redis is non-critical
  if (process.env.NODE_ENV !== 'production') globalForRedis.redis = client
  return client
})()

/** TTL in seconds for risk score cache (default 30 min) */
export const RISK_CACHE_TTL = parseInt(process.env.RISK_CACHE_TTL_S ?? '1800', 10)

/** Cache key: facility + 30-min time bucket so stale data auto-expires */
export function riskCacheKey(facilityId: string): string {
  const bucket = Math.floor(Date.now() / (RISK_CACHE_TTL * 1000))
  return `risk:${facilityId}:${bucket}`
}
