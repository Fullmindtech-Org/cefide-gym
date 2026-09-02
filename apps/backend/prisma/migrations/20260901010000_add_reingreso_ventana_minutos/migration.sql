-- Conserva el comportamiento actual de tres horas y permite administrarlo.
ALTER TABLE "ConfigSistema"
ADD COLUMN "reingresoVentanaMinutos" INTEGER NOT NULL DEFAULT 180;
