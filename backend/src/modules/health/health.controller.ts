import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import IORedis from 'ioredis';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get()
  check() {
    return {
      status: 'ok',
      env: process.env.NODE_ENV ?? 'development',
      version: '1.0.0',
    };
  }

  @Get('deep')
  async deepCheck() {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const allOk = database === 'ok' && redis === 'ok';

    return {
      status: allOk ? 'ok' : 'degraded',
      env: process.env.NODE_ENV ?? 'development',
      services: { database, redis },
    };
  }

  private async checkDatabase(): Promise<'ok' | 'error'> {
    try {
      await this.dataSource.query('SELECT 1');
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async checkRedis(): Promise<'ok' | 'error'> {
    const redisUrl = process.env.REDIS_URL;
    const client = redisUrl
      ? new IORedis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 3000, enableReadyCheck: false })
      : new IORedis({
          host: process.env.REDIS_HOST ?? 'localhost',
          port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
          maxRetriesPerRequest: 1,
          connectTimeout: 3000,
        });

    try {
      const pong = await client.ping();
      await client.quit();
      return pong === 'PONG' ? 'ok' : 'error';
    } catch {
      client.disconnect();
      return 'error';
    }
  }
}
