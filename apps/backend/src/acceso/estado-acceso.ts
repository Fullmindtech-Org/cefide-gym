import { EstadoIngreso } from '@prisma/client';
import { periodoArgentina } from '../reportes/deudores-periodo';

export function rangoMesActual(ahora = new Date()) {
  const inicio = new Date(`${periodoArgentina(ahora)}-01T00:00:00-03:00`);
  const fin = new Date(inicio);
  fin.setUTCMonth(fin.getUTCMonth() + 1);
  return { gte: inicio, lt: fin };
}

export function contarSesionesDeGracia(fechas: Date[], ventanaMs: number): number {
  let sesiones = 0;
  let anterior: Date | undefined;
  for (const fecha of fechas) {
    if (!anterior || fecha.getTime() - anterior.getTime() >= ventanaMs) sesiones++;
    anterior = fecha;
  }
  return sesiones;
}

export function estadoAcceso(ins: { pagado: boolean; clasesTotal: number; clasesUsadas: number },
  activo: boolean, graciaRestante: number, reingreso: boolean) {
  if (!activo) return { estado: EstadoIngreso.ROJO, motivo: 'Alumno inactivo — acceso bloqueado' };
  if (reingreso) return { estado: ins.pagado ? EstadoIngreso.VERDE : EstadoIngreso.AMARILLO,
    motivo: 'Reingreso permitido sin descontar otra clase' };
  if (ins.clasesTotal <= ins.clasesUsadas) return { estado: EstadoIngreso.ROJO, motivo: 'Sin clases disponibles' };
  if (ins.pagado) return { estado: EstadoIngreso.VERDE, motivo: 'Acceso permitido' };
  if (graciaRestante > 0) return { estado: EstadoIngreso.AMARILLO,
    motivo: `${graciaRestante} clase(s) de gracia disponibles. Regularizar pago.` };
  return { estado: EstadoIngreso.ROJO, motivo: 'Sin clases de gracia — regularizar pago' };
}
