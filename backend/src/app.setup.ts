import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { allowedOrigins } from './config/env';
import { csrfProtection } from './security/csrf.middleware';

// Middlewares e pipes da API. Usado pelo main.ts e pelos testes e2e,
// para os testes rodarem com exatamente as mesmas proteções de produção.
// O app precisa ser criado com { bodyParser: false }.
export function configureApp(app: NestExpressApplication) {
  // Atrás de proxy/load balancer em produção, o IP real vem do X-Forwarded-For.
  // Sem isso, o rate limit veria todo mundo com o IP do proxy.
  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  }
  app.disable('x-powered-by');

  // A API só devolve JSON: CSP mínima e headers de segurança padrão do helmet.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  // Corpo pequeno: nenhuma rota precisa de mais que isso, e limita abuso.
  app.useBodyParser('json', { limit: '20kb' });
  app.use(cookieParser());
  app.use(csrfProtection);

  app.enableCors({
    origin: allowedOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type'],
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
