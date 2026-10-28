-- Protege escrituras de versiones anteriores durante un despliegue gradual.
-- No completa retrospectivamente los registros sin evidencia del primer cobro.
ALTER TABLE "Pago" ALTER COLUMN "registradoEn"
SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
