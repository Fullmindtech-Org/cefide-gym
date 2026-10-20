BEGIN;

-- Cambio aditivo: fecha sigue siendo la cobertura y no se modifica.
ALTER TABLE "Pago" ADD COLUMN "registradoEn" TIMESTAMP(3);

-- Los movimientos ordinarios y la primera cuota adelantada ya conservan la fecha real.
UPDATE "Pago"
SET "registradoEn" = fecha
WHERE nota IS NULL OR nota NOT LIKE 'Pago adelantado %'
   OR nota ~ '^Pago adelantado 1/([1-9]|1[0-2])$';

-- Recuperar adelantos legados solo con una primera cuota inequívoca del mismo cobro.
-- La fecha de cobertura se generó sumando meses en Argentina, ajustando el fin de mes
-- y truncando milisegundos en las cuotas futuras. No se infieren fechas sin evidencia.
WITH candidatos AS (
  SELECT p.id, MIN(base.fecha) AS instante
  FROM "Pago" p
  CROSS JOIN LATERAL regexp_match(p.nota, '^Pago adelantado ([0-9]{1,2})/([0-9]{1,2})$') AS partes(valores)
  JOIN "Pago" base ON base."alumnoId" = p."alumnoId"
    AND base."inscripcionId" = p."inscripcionId"
    AND base.tipo = 'PAGO'
    AND base.nota = 'Pago adelantado 1/' || partes.valores[2]
  WHERE p."registradoEn" IS NULL AND p.tipo = 'PAGO'
    AND partes.valores[1]::int BETWEEN 2 AND 12
    AND partes.valores[2]::int BETWEEN partes.valores[1]::int AND 12
    AND p.fecha = (
      date_trunc('second',
        ((base.fecha AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Buenos_Aires')
        + make_interval(months => partes.valores[1]::int - 1)
      ) AT TIME ZONE 'America/Argentina/Buenos_Aires'
    ) AT TIME ZONE 'UTC'
  GROUP BY p.id
  HAVING COUNT(DISTINCT base.fecha) = 1
)
UPDATE "Pago" p SET "registradoEn" = c.instante
FROM candidatos c WHERE p.id = c.id;

CREATE INDEX "Pago_registradoEn_idx" ON "Pago"("registradoEn");

COMMIT;
