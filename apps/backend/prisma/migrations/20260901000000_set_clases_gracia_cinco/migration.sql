-- La política vigente permite cinco clases de gracia por mes.
ALTER TABLE "ConfigSistema" ALTER COLUMN "clasesGracia" SET DEFAULT 5;

-- ConfigSistema tiene una única fila global. La actualizamos de forma
-- incremental para que el deployment normal aplique la nueva política.
UPDATE "ConfigSistema"
SET "clasesGracia" = 5
WHERE "id" = 'global';
