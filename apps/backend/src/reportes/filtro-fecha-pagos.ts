import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// El mes corresponde a la cobertura. Un rango de fechas consulta instantes de cobro.
export function filtroFechaPagos(periodo?: string, desde?: string, hasta?: string): Prisma.PagoWhereInput {
  if (periodo) {
    if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(periodo)) throw new BadRequestException('Período inválido');
    const inicio = new Date(periodo + '-01T00:00:00-03:00');
    const fin = new Date(inicio);
    fin.setUTCMonth(fin.getUTCMonth() + 1);
    return { fecha: { gte: inicio, lt: fin } };
  }
  if (!desde && !hasta) return {};
  const fechaDia = (value: string) => {
    if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) {
      throw new BadRequestException('Fecha inválida');
    }
    const parsed = new Date(value + 'T00:00:00-03:00');
    if (parsed.toISOString().slice(0, 10) !== value) throw new BadRequestException('Fecha inválida');
    return parsed;
  };
  const inicio = desde ? fechaDia(desde) : undefined;
  const fin = hasta ? fechaDia(hasta) : undefined;
  if (inicio && fin && inicio > fin) throw new BadRequestException('Desde debe ser anterior o igual a Hasta');
  if (fin) fin.setUTCDate(fin.getUTCDate() + 1);
  return { registradoEn: { ...(inicio ? { gte: inicio } : {}), ...(fin ? { lt: fin } : {}) } };
}
