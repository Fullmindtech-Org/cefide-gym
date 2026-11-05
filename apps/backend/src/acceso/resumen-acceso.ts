import { Prisma } from '@prisma/client';
import { contarSesionesDeGracia, estadoAcceso, rangoMesActual } from './estado-acceso';

type Inscripcion = {
  id: string; pagado: boolean; clasesTotal: number; clasesUsadas: number;
  alumno: { activo: boolean };
};

/** Calcula los estados en lote con las mismas reglas del validador, sin consumir clases. */
export async function resumirAccesos<T extends Inscripcion>(
  db: Pick<Prisma.TransactionClient, 'configSistema' | 'ingreso'>, inscripciones: T[], ahora = new Date(),
) {
  if (!inscripciones.length) return [];
  const config = await db.configSistema.findUnique({ where: { id: 'global' } });
  const ventanaMs = (config?.reingresoVentanaMinutos ?? 180) * 60_000;
  const mes = rangoMesActual(ahora);
  const desde = new Date(Math.min(mes.gte.getTime(), ahora.getTime() - ventanaMs));
  const ingresos = await db.ingreso.findMany({
    where: { inscripcionId: { in: inscripciones.map(i => i.id) }, estado: { in: ['VERDE', 'AMARILLO'] }, fechaHora: { gte: desde, lte: ahora } },
    select: { inscripcionId: true, fechaHora: true, estado: true }, orderBy: { fechaHora: 'asc' },
  });
  const porInscripcion = new Map<string, typeof ingresos>();
  for (const ingreso of ingresos) {
    if (!ingreso.inscripcionId) continue;
    const lista = porInscripcion.get(ingreso.inscripcionId) ?? [];
    lista.push(ingreso);
    porInscripcion.set(ingreso.inscripcionId, lista);
  }
  return inscripciones.map(ins => {
    const lista = porInscripcion.get(ins.id) ?? [];
    const gracia = (config?.clasesGracia ?? 5) - contarSesionesDeGracia(
      lista.filter(i => i.estado === 'AMARILLO' && i.fechaHora >= mes.gte).map(i => i.fechaHora), ventanaMs);
    const reingreso = lista.some(i => i.fechaHora.getTime() >= ahora.getTime() - ventanaMs);
    const acceso = estadoAcceso(ins, ins.alumno.activo, gracia, reingreso);
    return { ...ins, estadoAcceso: acceso.estado, motivoAcceso: acceso.motivo };
  });
}
