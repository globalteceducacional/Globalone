import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import * as express from 'express';
import { join } from 'path';
import * as fs from 'fs';
import helmet from 'helmet';
import { expressBodyParserLimit } from './common/constants/upload-limits';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { validationExceptionFactory } from './common/pipes/validation-exception.factory';

function registerPayloadTooLargeHandler(app: INestApplication) {
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use(
    (
      err: { type?: string },
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (err?.type === 'entity.too.large') {
        return res.status(413).json({
          statusCode: 413,
          message: 'Arquivo ou envio muito grande. Reduza o tamanho e tente novamente.',
          messages: ['Arquivo ou envio muito grande. Reduza o tamanho e tente novamente.'],
        });
      }
      return next(err);
    },
  );
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });

  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const isProduction = nodeEnv === 'production';

  // Origens permitidas: separadas por vírgula no .env (ex.: CORS_ORIGINS=https://erp.exemplo.com)
  const rawOrigins = configService.get<string>('CORS_ORIGINS', '');
  const allowedOrigins = rawOrigins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: isProduction && allowedOrigins.length > 0
      ? (origin, callback) => {
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error(`Origem não permitida: ${origin}`));
          }
        }
      : true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['x-renewed-token'],
    credentials: true,
  });

  // Helmet: headers de segurança HTTP (CSP, HSTS, X-Frame-Options, etc.)
  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'blob:'],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameSrc: ["'none'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
      hsts: isProduction
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    }),
  );

  const bodyLimit = expressBodyParserLimit();
  app.use(json({ limit: bodyLimit }));
  app.use(
    urlencoded({
      limit: bodyLimit,
      extended: true,
    }),
  );
  // Servir arquivos estáticos enviados
  const uploadsDirEnv = process.env.UPLOADS_DIR;
  const uploadsUrlPrefix = process.env.UPLOADS_URL_PREFIX || '/uploads';

  // Se UPLOADS_DIR for um caminho local (não URL), usar esse diretório
  if (uploadsDirEnv && !/^https?:\/\//i.test(uploadsDirEnv)) {
    const uploadsRoot = uploadsDirEnv.startsWith('.')
      ? join(process.cwd(), uploadsDirEnv)
      : uploadsDirEnv;

    if (!fs.existsSync(uploadsRoot)) {
      fs.mkdirSync(uploadsRoot, { recursive: true });
    }

    app.use(uploadsUrlPrefix, express.static(uploadsRoot));
  } else {
    // Fallback padrão: ./uploads
    const uploadsRoot = join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsRoot)) {
      fs.mkdirSync(uploadsRoot, { recursive: true });
    }
    app.use('/uploads', express.static(uploadsRoot));
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
        excludeExtraneousValues: false,
      },
      exceptionFactory: validationExceptionFactory,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  registerPayloadTooLargeHandler(app);

  const port = configService.get<number>('PORT', 3000);

  // Health check endpoint está em HealthController

  await app.listen(port);
  console.log(`🚀 Backend ERP rodando na porta ${port}`);
  console.log(`📦 Ambiente: ${nodeEnv}`);
}

bootstrap();
