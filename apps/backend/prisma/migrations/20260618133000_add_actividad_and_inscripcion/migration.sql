-- CreateEnum
CREATE TYPE "Frecuencia" AS ENUM ('UNA_VEZ', 'DOS_VECES', 'TRES_VECES', 'LIBRE');

-- AlterTable
ALTER TABLE "Alumno" DROP COLUMN "profesorId",
DROP COLUMN "clasesTotal",
DROP COLUMN "clasesUsadas",
DROP COLUMN "pagado",
DROP COLUMN "fechaPago";

-- AlterTable
ALTER TABLE "ConfigSistema" ADD COLUMN "clasesUnaVez" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "clasesDosVeces" INTEGER NOT NULL DEFAULT 9,
ADD COLUMN "clasesTresVeces" INTEGER NOT NULL DEFAULT 13,
ADD COLUMN "clasesLibre" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "Ingreso" ADD COLUMN "inscripcionId" TEXT;

-- AlterTable
ALTER TABLE "Pago" ADD COLUMN "inscripcionId" TEXT;

-- CreateTable
CREATE TABLE "Actividad" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InscripcionActividad" (
    "id" TEXT NOT NULL,
    "alumnoId" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,
    "frecuencia" "Frecuencia" NOT NULL,
    "clasesTotal" INTEGER NOT NULL,
    "clasesUsadas" INTEGER NOT NULL DEFAULT 0,
    "pagado" BOOLEAN NOT NULL DEFAULT false,
    "fechaPago" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InscripcionActividad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Actividad_nombre_key" ON "Actividad"("nombre");

-- CreateIndex
CREATE INDEX "InscripcionActividad_alumnoId_idx" ON "InscripcionActividad"("alumnoId");

-- CreateIndex
CREATE INDEX "InscripcionActividad_actividadId_idx" ON "InscripcionActividad"("actividadId");

-- CreateIndex
CREATE UNIQUE INDEX "InscripcionActividad_alumnoId_actividadId_key" ON "InscripcionActividad"("alumnoId", "actividadId");

-- CreateIndex
CREATE INDEX "Ingreso_inscripcionId_idx" ON "Ingreso"("inscripcionId");

-- CreateIndex
CREATE INDEX "Pago_inscripcionId_idx" ON "Pago"("inscripcionId");

-- AddForeignKey
ALTER TABLE "InscripcionActividad" ADD CONSTRAINT "InscripcionActividad_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "Alumno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscripcionActividad" ADD CONSTRAINT "InscripcionActividad_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "Actividad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingreso" ADD CONSTRAINT "Ingreso_inscripcionId_fkey" FOREIGN KEY ("inscripcionId") REFERENCES "InscripcionActividad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_inscripcionId_fkey" FOREIGN KEY ("inscripcionId") REFERENCES "InscripcionActividad"("id") ON DELETE SET NULL ON UPDATE CASCADE;
