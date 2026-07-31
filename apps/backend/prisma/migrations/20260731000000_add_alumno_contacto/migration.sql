-- Datos de contacto del alumno (editables desde el panel + buscables).
-- Antes se descartaban al importar el backup (domicilio/telefono informativos).
-- Idempotente (guard IF NOT EXISTS).

ALTER TABLE "Alumno"
  ADD COLUMN IF NOT EXISTS "telefono" TEXT,
  ADD COLUMN IF NOT EXISTS "direccion" TEXT;
