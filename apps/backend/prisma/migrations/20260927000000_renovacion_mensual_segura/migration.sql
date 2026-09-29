CREATE TYPE "ModoRenovacion" AS ENUM ('MANUAL', 'AUTOMATICO');
CREATE TYPE "ProgramacionRenovacion" AS ENUM ('ULTIMO_DIA_MES', 'PRIMER_LUNES_HABIL');
CREATE TYPE "EstadoRenovacion" AS ENUM ('EN_PROCESO', 'COMPLETADA', 'FALLIDA');
CREATE TYPE "OrigenRenovacion" AS ENUM ('MANUAL', 'AUTOMATICA');

ALTER TABLE "ConfigSistema"
  ADD COLUMN "modoRenovacion" "ModoRenovacion" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "programacionRenovacion" "ProgramacionRenovacion" NOT NULL DEFAULT 'ULTIMO_DIA_MES';

CREATE TABLE "RenovacionMensual" (
  "id" TEXT NOT NULL, "periodo" TEXT NOT NULL, "estado" "EstadoRenovacion" NOT NULL DEFAULT 'EN_PROCESO',
  "iniciadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finalizadaEn" TIMESTAMP(3),
  "totalEncontradas" INTEGER NOT NULL DEFAULT 0, "renovadas" INTEGER NOT NULL DEFAULT 0, "omitidas" INTEGER NOT NULL DEFAULT 0,
  "errores" INTEGER NOT NULL DEFAULT 0, "errorMensaje" TEXT,
  CONSTRAINT "RenovacionMensual_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RenovacionMensual_periodo_key" ON "RenovacionMensual"("periodo");
CREATE INDEX "RenovacionMensual_estado_idx" ON "RenovacionMensual"("estado");

CREATE TABLE "EjecucionRenovacion" (
  "id" TEXT NOT NULL, "renovacionId" TEXT NOT NULL, "origen" "OrigenRenovacion" NOT NULL, "usuarioId" TEXT,
  "iniciadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finalizadaEn" TIMESTAMP(3), "estado" "EstadoRenovacion" NOT NULL DEFAULT 'EN_PROCESO',
  "totalEncontradas" INTEGER NOT NULL DEFAULT 0, "renovadas" INTEGER NOT NULL DEFAULT 0, "omitidas" INTEGER NOT NULL DEFAULT 0,
  "errores" INTEGER NOT NULL DEFAULT 0, "errorMensaje" TEXT,
  CONSTRAINT "EjecucionRenovacion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EjecucionRenovacion_renovacionId_idx" ON "EjecucionRenovacion"("renovacionId");
CREATE INDEX "EjecucionRenovacion_usuarioId_idx" ON "EjecucionRenovacion"("usuarioId");
ALTER TABLE "EjecucionRenovacion" ADD CONSTRAINT "EjecucionRenovacion_renovacionId_fkey" FOREIGN KEY ("renovacionId") REFERENCES "RenovacionMensual"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EjecucionRenovacion" ADD CONSTRAINT "EjecucionRenovacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AuditoriaConfiguracionRenovacion" (
  "id" TEXT NOT NULL, "usuarioId" TEXT, "modoAnterior" "ModoRenovacion" NOT NULL, "modoNuevo" "ModoRenovacion" NOT NULL,
  "programacionAnterior" "ProgramacionRenovacion" NOT NULL, "programacionNueva" "ProgramacionRenovacion" NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditoriaConfiguracionRenovacion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditoriaConfiguracionRenovacion_creadoEn_idx" ON "AuditoriaConfiguracionRenovacion"("creadoEn");
CREATE INDEX "AuditoriaConfiguracionRenovacion_usuarioId_idx" ON "AuditoriaConfiguracionRenovacion"("usuarioId");
ALTER TABLE "AuditoriaConfiguracionRenovacion" ADD CONSTRAINT "AuditoriaConfiguracionRenovacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
