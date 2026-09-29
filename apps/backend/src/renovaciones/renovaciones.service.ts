import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Frecuencia, ModoRenovacion, OrigenRenovacion, Prisma, ProgramacionRenovacion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const ZONA_ARGENTINA = 'America/Argentina/Buenos_Aires';

type ConfiguracionInput = { modo: ModoRenovacion; programacion: ProgramacionRenovacion };

function partesArgentina(fecha: Date) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_ARGENTINA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(fecha);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  return { year: valor('year'), month: valor('month'), day: valor('day'), hour: valor('hour'), minute: valor('minute') };
}

// Convierte una fecha de pared argentina a UTC sin depender de la zona del contenedor.
function fechaArgentinaUtc(year: number, month: number, day: number, hour = 23, minute = 59) {
  let resultado = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const observado = partesArgentina(resultado);
  const esperadoMs = Date.UTC(year, month - 1, day, hour, minute);
  const observadoMs = Date.UTC(observado.year, observado.month - 1, observado.day, observado.hour, observado.minute);
  resultado = new Date(resultado.getTime() + esperadoMs - observadoMs);
  return resultado;
}

function ultimoDia(year: number, month: number) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
function sumarMes(year: number, month: number) { return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }; }
function periodo(year: number, month: number) { return `${year}-${String(month).padStart(2, '0')}`; }

@Injectable()
export class RenovacionesService {
  constructor(private readonly prisma: PrismaService) {}

  private async configuracion() {
    return this.prisma.configSistema.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } });
  }

  private fechaProgramada(year: number, month: number, programacion: ProgramacionRenovacion) {
    if (programacion === ProgramacionRenovacion.ULTIMO_DIA_MES) {
      const dia = ultimoDia(year, month);
      const siguiente = sumarMes(year, month);
      return { fecha: fechaArgentinaUtc(year, month, dia), periodo: periodo(siguiente.year, siguiente.month) };
    }
    const primerDia = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const primerLunes = 1 + ((8 - primerDia) % 7);
    const domingo = primerLunes - 1;
    if (domingo === 0) {
      const previo = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
      return { fecha: fechaArgentinaUtc(previo.year, previo.month, ultimoDia(previo.year, previo.month)), periodo: periodo(year, month) };
    }
    return { fecha: fechaArgentinaUtc(year, month, domingo), periodo: periodo(year, month) };
  }

  private proximaProgramacion(programacion: ProgramacionRenovacion, ahora = new Date()) {
    const local = partesArgentina(ahora);
    let candidato = this.fechaProgramada(local.year, local.month, programacion);
    if (candidato.fecha.getTime() <= ahora.getTime()) {
      const siguiente = sumarMes(local.year, local.month);
      candidato = this.fechaProgramada(siguiente.year, siguiente.month, programacion);
    }
    return candidato;
  }

  async estado() {
    const config = await this.configuracion();
    const ultima = await this.prisma.renovacionMensual.findFirst({ where: { estado: 'COMPLETADA' }, orderBy: { finalizadaEn: 'desc' } });
    const proxima = config.modoRenovacion === ModoRenovacion.AUTOMATICO ? this.proximaProgramacion(config.programacionRenovacion) : null;
    return { modo: config.modoRenovacion, programacion: config.programacionRenovacion, proximaEjecucion: proxima?.fecha ?? null, proximoPeriodo: proxima?.periodo ?? null, ultimaRenovacion: ultima ?? null };
  }

  proxima(programacion: ProgramacionRenovacion) {
    return this.proximaProgramacion(programacion);
  }

  async vistaPrevia() {
    const config = await this.configuracion();
    const proxima = this.proximaProgramacion(config.programacionRenovacion);
    const [cantidad, existente] = await Promise.all([
      this.prisma.inscripcionActividad.count({ where: { alumno: { activo: true } } }),
      this.prisma.renovacionMensual.findUnique({ where: { periodo: proxima.periodo } }),
    ]);
    return { periodo: proxima.periodo, cantidadEstimada: cantidad, estadoPeriodo: existente?.estado ?? 'PENDIENTE' };
  }

  async actualizarConfiguracion(usuarioId: string, input: ConfiguracionInput) {
    const actual = await this.configuracion();
    if (actual.modoRenovacion === input.modo && actual.programacionRenovacion === input.programacion) return this.estado();
    await this.prisma.$transaction([
      this.prisma.configSistema.update({ where: { id: 'global' }, data: { modoRenovacion: input.modo, programacionRenovacion: input.programacion, automaticoDesde: input.modo === ModoRenovacion.AUTOMATICO ? new Date() : null } }),
      this.prisma.auditoriaConfiguracionRenovacion.create({ data: { usuarioId, modoAnterior: actual.modoRenovacion, modoNuevo: input.modo, programacionAnterior: actual.programacionRenovacion, programacionNueva: input.programacion } }),
    ]);
    return this.estado();
  }

  async ejecutarManual(usuarioId: string) {
    const config = await this.configuracion();
    if (config.modoRenovacion !== ModoRenovacion.MANUAL) throw new ConflictException('La renovación manual solo está disponible en modo Manual');
    const previa = await this.vistaPrevia();
    return this.ejecutar(previa.periodo, OrigenRenovacion.MANUAL, usuarioId);
  }

  async ejecutarAutomatica(ahora = new Date()) {
    const config = await this.configuracion();
    if (config.modoRenovacion !== ModoRenovacion.AUTOMATICO || !config.automaticoDesde) return null;
    const local = partesArgentina(ahora);
    const anterior = local.month === 1 ? { year: local.year - 1, month: 12 } : { year: local.year, month: local.month - 1 };
    const siguiente = sumarMes(local.year, local.month);
    const programada = [
      this.fechaProgramada(anterior.year, anterior.month, config.programacionRenovacion),
      this.fechaProgramada(local.year, local.month, config.programacionRenovacion),
      this.fechaProgramada(siguiente.year, siguiente.month, config.programacionRenovacion),
    ].filter((candidata) => candidata.fecha <= ahora && candidata.fecha >= config.automaticoDesde!)
      .sort((a, b) => b.fecha.getTime() - a.fecha.getTime())[0];
    if (!programada) return null;
    const existente = await this.prisma.renovacionMensual.findUnique({ where: { periodo: programada.periodo } });
    if (existente?.estado === 'COMPLETADA') return null;
    return this.ejecutar(programada.periodo, OrigenRenovacion.AUTOMATICA);
  }

  private clasesPorFrecuencia(config: Awaited<ReturnType<RenovacionesService['configuracion']>>) {
    return new Map<Frecuencia, number>([
      [Frecuencia.CLASE_SUELTA, config.clasesSuelta], [Frecuencia.UNA_VEZ, config.clasesUnaVez], [Frecuencia.DOS_VECES, config.clasesDosVeces], [Frecuencia.TRES_VECES, config.clasesTresVeces], [Frecuencia.CUATRO_VECES, config.clasesCuatroVeces], [Frecuencia.CINCO_VECES, config.clasesCincoVeces], [Frecuencia.LIBRE, config.clasesLibre], [Frecuencia.BECADO, config.clasesBecado],
    ]);
  }

  private async ejecutar(periodoObjetivo: string, origen: OrigenRenovacion, usuarioId?: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${periodoObjetivo}))`);
        const anterior = await tx.renovacionMensual.findUnique({ where: { periodo: periodoObjetivo } });
        if (anterior?.estado === 'COMPLETADA') return { periodo: periodoObjetivo, yaCompletada: true, procesados: anterior.totalEncontradas, renovados: anterior.renovadas, omitidos: anterior.omitidas, errores: anterior.errores };
        const renovacion = anterior
          ? await tx.renovacionMensual.update({ where: { id: anterior.id }, data: { estado: 'EN_PROCESO', iniciadaEn: new Date(), finalizadaEn: null, errorMensaje: null } })
          : await tx.renovacionMensual.create({ data: { periodo: periodoObjetivo } });
        const ejecucion = await tx.ejecucionRenovacion.create({ data: { renovacionId: renovacion.id, origen, usuarioId } });
        const config = await tx.configSistema.findUnique({ where: { id: 'global' } });
        if (!config) throw new BadRequestException('No existe la configuración del sistema');
        const total = await tx.inscripcionActividad.count({ where: { alumno: { activo: true } } });
        for (const [frecuencia, clasesTotal] of this.clasesPorFrecuencia(config)) {
          await tx.inscripcionActividad.updateMany({ where: { frecuencia, alumno: { activo: true } }, data: { clasesUsadas: 0, clasesTotal, pagado: false, fechaPago: null } });
        }
        const finalizadaEn = new Date();
        const datos = { estado: 'COMPLETADA' as const, finalizadaEn, totalEncontradas: total, renovadas: total, omitidas: 0, errores: 0, errorMensaje: null };
        await tx.renovacionMensual.update({ where: { id: renovacion.id }, data: datos });
        await tx.ejecucionRenovacion.update({ where: { id: ejecucion.id }, data: datos });
        await tx.configSistema.update({ where: { id: 'global' }, data: { ultimaRenovacion: finalizadaEn } });
        return { periodo: periodoObjetivo, yaCompletada: false, procesados: total, renovados: total, omitidos: 0, errores: 0 };
      }, { timeout: 30_000 });
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'Error desconocido durante la renovación';
      // Una respuesta incierta de red puede ocurrir luego del commit. Nunca se
      // degrada una renovación ya completada a FALLIDA ni se habilita repetirla.
      const existente = await this.prisma.renovacionMensual.findUnique({ where: { periodo: periodoObjetivo } });
      if (existente?.estado === 'COMPLETADA') throw error;
      // El trabajo se revierte por transacción; queda una auditoría de fallo para el reintento.
      const renovacion = await this.prisma.renovacionMensual.upsert({ where: { periodo: periodoObjetivo }, create: { periodo: periodoObjetivo, estado: 'FALLIDA', finalizadaEn: new Date(), errores: 1, errorMensaje: mensaje }, update: { estado: 'FALLIDA', finalizadaEn: new Date(), errores: 1, errorMensaje: mensaje } });
      await this.prisma.ejecucionRenovacion.create({ data: { renovacionId: renovacion.id, origen, usuarioId, estado: 'FALLIDA', finalizadaEn: new Date(), errores: 1, errorMensaje: mensaje } });
      throw error;
    }
  }
}

