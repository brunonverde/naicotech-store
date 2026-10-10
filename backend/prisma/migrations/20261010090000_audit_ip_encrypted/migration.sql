-- IPs passam a ser guardados criptografados. Os registros antigos (em texto puro)
-- são descartados: não há como criptografá-los em SQL sem expor a chave.
ALTER TABLE "AdminAuditLog" ADD COLUMN "ipEnc" TEXT;
ALTER TABLE "AdminAuditLog" DROP COLUMN "ip";
