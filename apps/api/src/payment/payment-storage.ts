import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { diskStorage } from 'multer';
import type { Request } from 'express';

export const UPLOAD_DIR = join(process.cwd(), 'uploads', 'proofs');
export const GCASH_QR_DIR = join(process.cwd(), 'uploads', 'gcash-qr');

export function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

export function ensureGcashQrDir() {
  if (!existsSync(GCASH_QR_DIR)) {
    mkdirSync(GCASH_QR_DIR, { recursive: true });
  }
}

ensureUploadDir();
ensureGcashQrDir();

export const proofStorage = diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDir();
    cb(null, UPLOAD_DIR);
  },
  filename: (_req: Request, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

export const gcashQrStorage = diskStorage({
  destination: (_req, _file, cb) => {
    ensureGcashQrDir();
    cb(null, GCASH_QR_DIR);
  },
  filename: (_req: Request, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

export const proofFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowed.includes(file.mimetype)) {
    cb(new Error('Proof must be a JPG, PNG, WEBP, or PDF file'), false);
    return;
  }
  cb(null, true);
};

export const gcashQrFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.mimetype)) {
    cb(new Error('GCash QR must be a JPG, PNG, or WEBP image'), false);
    return;
  }
  cb(null, true);
};
