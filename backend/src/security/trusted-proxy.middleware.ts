import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';

export const PROXY_SECRET_HEADER = 'x-proxy-secret';
export const CLIENT_IP_HEADER = 'x-client-ip';

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Quando a API fica atrás do proxy do frontend (ex.: middleware do Vercel), ela só
 * aceita requisições que trazem o segredo compartilhado (PROXY_SECRET). Sem isso,
 * alguém poderia chamar a API direto e forjar o próprio IP para driblar o rate limit.
 *
 * O IP do visitante vem no header X-Client-IP, que só o proxy (de confiança) define.
 */
export function trustedProxy(secret: string) {
  const expected = digest(secret);
  return (req: Request, res: Response, next: NextFunction) => {
    const given = req.headers[PROXY_SECRET_HEADER];
    // Compara os hashes: tempo constante e sem depender do tamanho do valor enviado.
    if (typeof given !== 'string' || !timingSafeEqual(digest(given), expected)) {
      res.status(403).json({ statusCode: 403, message: 'Acesso direto à API não permitido' });
      return;
    }
    delete req.headers[PROXY_SECRET_HEADER];

    const clientIp = req.headers[CLIENT_IP_HEADER];
    if (typeof clientIp === 'string' && isIP(clientIp)) {
      // req.ip é usado pelo rate limit e pela auditoria.
      Object.defineProperty(req, 'ip', { value: clientIp, configurable: true });
    }
    next();
  };
}
