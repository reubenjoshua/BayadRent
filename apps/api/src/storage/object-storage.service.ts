import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

@Injectable()
export class ObjectStorageService {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string | null;
  private readonly publicBase: string | null;

  constructor(config: ConfigService) {
    const endpoint = config.get<string>('S3_ENDPOINT');
    const accessKey = config.get<string>('S3_ACCESS_KEY');
    const secretKey = config.get<string>('S3_SECRET_KEY');
    const bucket = config.get<string>('S3_BUCKET');

    if (endpoint && accessKey && secretKey && bucket) {
      this.bucket = bucket;
      this.publicBase = config.get<string>('S3_PUBLIC_URL') ?? null;
      this.client = new S3Client({
        region: config.get<string>('S3_REGION') ?? 'auto',
        endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: accessKey,
          secretAccessKey: secretKey,
        },
      });
      this.logger.log(`Object storage enabled → bucket=${bucket}`);
    } else {
      this.client = null;
      this.bucket = null;
      this.publicBase = null;
      this.logger.log('Object storage not configured — using local disk uploads');
    }
  }

  get enabled() {
    return Boolean(this.client && this.bucket);
  }

  async putObject(key: string, body: Buffer, contentType: string) {
    if (!this.client || !this.bucket) {
      throw new Error('Object storage is not configured');
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return key;
  }

  async getObjectStream(key: string): Promise<{ stream: Readable; contentType?: string }> {
    if (!this.client || !this.bucket) {
      throw new Error('Object storage is not configured');
    }
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    return {
      stream: result.Body as Readable,
      contentType: result.ContentType,
    };
  }
}
