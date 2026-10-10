import { SecretBox } from './secret-box';

// IP é dado pessoal (LGPD). Guardado só criptografado, com chave própria.
const box = new SecretBox('IP_ENCRYPTION_KEY');
const CONTEXT = 'audit-ip';

export const encryptIp = (ip: string) => box.encrypt(ip, CONTEXT);

export function decryptIp(enc: string): string | null {
  try {
    return box.decrypt(enc, CONTEXT);
  } catch {
    return null;
  }
}

/** Mostra só a rede (ex.: 189.45.•••.•••), suficiente para reconhecer acessos suspeitos. */
export function maskIp(ip: string): string {
  const v4 = ip.replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) {
    const [a, b] = v4.split('.');
    return `${a}.${b}.•••.•••`;
  }
  const groups = ip.split(':').filter(Boolean);
  return `${groups.slice(0, 2).join(':')}:•••`;
}
