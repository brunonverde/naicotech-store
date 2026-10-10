import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Criptografia AES-256-GCM para dados guardados no banco. Cada uso tem a própria
 * chave no .env (64 caracteres hex): vazar uma não abre os dados da outra.
 *
 * `context` (opcional) amarra o texto criptografado a um dono (ex.: o ID do usuário).
 * Se alguém copiar o valor de uma linha para outra no banco, ele não abre.
 */
export class SecretBox {
  constructor(private readonly envName: string) {}

  private key(): Buffer {
    const buffer = Buffer.from(process.env[this.envName] ?? '', 'hex');
    if (buffer.length !== 32) throw new Error(`${this.envName} precisa ter 64 caracteres hexadecimais`);
    return buffer;
  }

  encrypt(plain: string, context?: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    if (context) cipher.setAAD(Buffer.from(context, 'utf8'));
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
  }

  decrypt(payload: string, context?: string): string {
    const [version, iv, tag, data] = payload.split(':');
    if (version !== 'v1' || !iv || !tag || !data) throw new Error('Dado criptografado em formato inválido');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'base64'));
    if (context) decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  }
}
