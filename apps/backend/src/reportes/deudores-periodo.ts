import { BadRequestException } from '@nestjs/common';

export const CRITERIO_DEUDORES_HISTORICO =
  'Alumnos actualmente activos, con inscripción creada antes del cierre del mes con al menos un ingreso permitido a esa actividad en el mes y sin pago vigente registrado en ese mes. ' +
  'Se considera el último movimiento (pago o anulación) del mes, en horario de Argentina. ' +
  'El estado activo, la actividad y la frecuencia son los actuales; no existe historial de sus cambios. ' +
  'Las clases históricas no están disponibles. Se excluyen las inscripciones sin asistencia. Los becados requieren revisión antes de reclamar deuda. ' +
  'Los pagos no tienen un período facturado separado de la fecha; no se imputan pagos de otros meses.';

export function rangoDeudoresHistorico(periodo: string, ahora = new Date()) {
  if (typeof periodo !== 'string' || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(periodo)) {
    throw new BadRequestException('El período debe tener formato AAAA-MM.');
  }
  const actual = periodoArgentina(ahora);
  if (periodo >= actual) {
    throw new BadRequestException('Seleccioná un mes anterior al actual. Para el estado vigente, usá el reporte actual.');
  }
  const inicio = new Date(periodo + '-01T00:00:00-03:00');
  const fin = new Date(inicio);
  fin.setUTCMonth(fin.getUTCMonth() + 1);
  return { inicio, fin };
}

export function periodoArgentina(ahora: Date) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit',
  }).formatToParts(ahora);
  return partes.find((p) => p.type === 'year')!.value + '-' +
    partes.find((p) => p.type === 'month')!.value;
}
