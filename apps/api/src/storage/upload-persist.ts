import { unlink, readFile } from 'fs/promises';
import { join } from 'path';
import type { ObjectStorageService } from './object-storage.service';
import { GCASH_QR_DIR, UPLOAD_DIR } from '../payment/payment-storage';

/** Persist a multer disk file to S3 when configured; returns stored path key. */
export async function persistUploadedFile(
  storage: ObjectStorageService,
  file: Express.Multer.File,
  folder: 'proofs' | 'gcash-qr',
) {
  if (!storage.enabled) {
    return file.filename;
  }

  const dir = folder === 'proofs' ? UPLOAD_DIR : GCASH_QR_DIR;
  const localPath = join(dir, file.filename);
  const key = `${folder}/${file.filename}`;
  const body = await readFile(localPath);
  await storage.putObject(key, body, file.mimetype);
  try {
    await unlink(localPath);
  } catch {
    // ignore cleanup failures
  }
  return `s3:${key}`;
}

export function isS3Path(path: string) {
  return path.startsWith('s3:');
}

export function s3KeyFromPath(path: string) {
  return path.slice(3);
}
