import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export function createRedisConnection(config: ConfigService) {
  const url = config.get<string>('REDIS_URL') ?? 'redis://127.0.0.1:6379';
  return new Redis(url, {
    maxRetriesPerRequest: null,
  });
}
