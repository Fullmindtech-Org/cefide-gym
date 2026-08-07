-- Códigos de acceso ilimitado (DNIs comodín) configurables desde el panel.
-- Antes estaban hardcodeados en acceso.service.ts.
-- Idempotente (guard IF NOT EXISTS).

ALTER TABLE "ConfigSistema"
  ADD COLUMN IF NOT EXISTS "codigosComodin" TEXT NOT NULL DEFAULT '00000000,99999999';
