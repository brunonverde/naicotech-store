import type { CookieOptions, Response } from 'express';
import { isProduction } from '../config/env';

export const SESSION_COOKIE = 'naicotech_session';
export const SESSION_TTL_SECONDS = 24 * 60 * 60;
// Sessão de admin: separada, curta, só depois da verificação em duas etapas.
export const ADMIN_COOKIE = 'naicotech_admin';
export const ADMIN_SESSION_TTL_SECONDS = 30 * 60;

// httpOnly: o JavaScript da página não lê o cookie, então um XSS não rouba a sessão.
// SameSite=Strict: o navegador não envia o cookie em requisições vindas de outros sites (CSRF).
function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'strict',
    path: '/',
  };
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    ...cookieOptions(),
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

export function setAdminCookie(res: Response, token: string) {
  res.cookie(ADMIN_COOKIE, token, {
    ...cookieOptions(),
    maxAge: ADMIN_SESSION_TTL_SECONDS * 1000,
  });
}

export function clearAdminCookie(res: Response) {
  res.clearCookie(ADMIN_COOKIE, cookieOptions());
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  clearAdminCookie(res);
}
