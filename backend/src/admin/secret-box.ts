import { SecretBox } from '../security/secret-box';

// Criptografa os segredos do TOTP antes de salvar no banco (AES-256-GCM).
// Se alguém copiar o banco, não consegue gerar os códigos sem a TOTP_ENCRYPTION_KEY.
const box = new SecretBox('TOTP_ENCRYPTION_KEY');

export const encryptSecret = (plain: string) => box.encrypt(plain);
export const decryptSecret = (payload: string) => box.decrypt(payload);
