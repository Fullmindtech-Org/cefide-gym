-- Add ultimaRenovacion to ConfigSistema for idempotent daily cron (A3)
ALTER TABLE "ConfigSistema" ADD COLUMN "ultimaRenovacion" TIMESTAMP(3);
