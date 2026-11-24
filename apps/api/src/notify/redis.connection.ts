import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export function createRedisConnection(config: ConfigService) {
  const url = config.get<string>('REDIS_URL') ?? 'redis://127.0.0.1:6379';
  const useTls = url.startsWith('rediss://');

  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    // Avoid hanging forever on bad/unreachable Redis (e.g. wrong URL on Render).
    connectTimeout: 10_000,
    // Prefer IPv4 when dual-stack DNS causes stalls on some hosts.
    family: 4,
    ...(useTls ? { tls: {} } : {}),
  });
}
