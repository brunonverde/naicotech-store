import type { NextFunction, Request, Response } from 'express';
import { allowedOrigins } from '../config/env';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// Chamado pelo servidor do Mercado Pago, sem cookie; autenticado pela assinatura.
const CSRF_EXEMPT = new Set(['/payments/webhook']);

/**
 * Defesa em camadas contra CSRF, além do cookie SameSite=Strict:
 * - Origin, quando enviado, precisa estar na lista de origens permitidas.
 * - Requisições que alteram dados precisam ser JSON. Um formulário HTML de outro
 *   site não consegue enviar application/json sem passar pelo CORS.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method) || CSRF_EXEMPT.has(req.path)) return next();

  const origin = req.headers.origin;
  if (origin && !allowedOrigins().includes(origin)) {
    res.status(403).json({ statusCode: 403, message: 'Origem não permitida' });
    return;
  }

  const hasBody = Number(req.headers['content-length'] ?? 0) > 0;
  if (hasBody && !req.is('application/json')) {
    res.status(415).json({ statusCode: 415, message: 'Envie os dados como JSON' });
    return;
  }
  next();
}
