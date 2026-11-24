import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

function ensureUploadDirs() {
  for (const dir of [
    join(process.cwd(), 'uploads', 'proofs'),
    join(process.cwd(), 'uploads', 'gcash-qr'),
  ]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

async function bootstrap() {
  ensureUploadDirs();
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('BayadRent API')
    .setDescription('Landlord–renter rent tracking and payments')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT ?? 4000);
  // Bind all interfaces so hosts like Render can detect the open port.
  await app.listen(port, '0.0.0.0');
  console.log(`BayadRent API listening on 0.0.0.0:${port}`);
}

bootstrap().catch((err) => {
  console.error('API failed to start', err);
  process.exit(1);
});
