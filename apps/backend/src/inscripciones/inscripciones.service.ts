import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Frecuencia, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInscripcionDto } from './dto/create-inscripcion.dto';
import { buildAlumnoSearch } from '../common/alumno-search';

const ZONA_ARGENTINA = 'America/Argentina/Buenos_Aires';

interface FindAllParams {
  search?: string;
  actividadId?: string;
  alumnoActivo?: boolean;
  pagado?: boolean;
  conClases?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  profesorId?: string;
}

function partesArgentina(fecha: Date) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_ARGENTINA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  return { year: valor('year'), month: valor('month'), day: valor('day'), hour: valor('hour'), minute: valor('minute'), second: valor('second') };
}

function fechaArgentinaUtc(year: number, month: number, day: number, hour = 12, minute = 0, second = 0) {
  let resultado = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const observado = partesArgentina(resultado);
  const esperadoMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const observadoMs = Date.UTC(observado.year, observado.month - 1, observado.day, observado.hour, observado.minute, observado.second);
  resultado = new Date(resultado.getTime() + esperadoMs - observadoMs);
  return resultado;
}

function ultimoDia(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function sumarMeses(year: number, month: number, meses: number) {
  const base = year * 12 + (month - 1) + meses;
  return { year: Math.floor(base / 12), month: (base % 12) + 1 };
}

@Injectable()
export class InscripcionesService {
  constructor(private readonly prisma: PrismaService) {}

  private fechasPagoAdelantado(cantidadMeses: number, ahora: Date) {
    const local = partesArgentina(ahora);
    return Array.from({ length: cantidadMeses }, (_, index) => {
      if (index === 0) return ahora;
      const objetivo = sumarMeses(local.year, local.month, index);
      const dia = Math.min(local.day, ultimoDia(objetivo.year, objetivo.month));
      return fechaArgentinaUtc(objetivo.year, objetivo.month, dia, local.hour, local.minute, local.second);
    });
  }

  private async clasesParaFrecuencia(frecuencia: Frecuencia): Promise<number> {
    const config = await this.prisma.configSistema.findUnique({
      where: { id: 'global' },
    });
    const map: Record<Frecuencia, number> = {
      CLASE_SUELTA: config?.clasesSuelta ?? 1,
      UNA_VEZ: config?.clasesUnaVez ?? 5,
      DOS_VECES: config?.clasesDosVeces ?? 9,
      TRES_VECES: config?.clasesTresVeces ?? 13,
      CUATRO_VECES: config?.clasesCuatroVeces ?? 17,
      CINCO_VECES: config?.clasesCincoVeces ?? 21,
      LIBRE: config?.clasesLibre ?? 30,
      BECADO: config?.clasesBecado ?? 30,
    };
    return map[frecuencia];
  }

  async findAll(params: FindAllParams) {
    const { search, actividadId, alumnoActivo, pagado, conClases, page = 1, limit = 20, profesorId, sortBy, sortOrder = 'asc' } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (profesorId) {
      const prof = await this.prisma.profesor.findUnique({
        where: { id: profesorId },
        select: { actividades: { select: { id: true } } },
      });
      const allowedIds = prof?.actividades.map((a) => a.id) ?? [];
      if (actividadId) {
        if (!allowedIds.includes(actividadId)) {
          return { data: [], total: 0, page, totalPages: 0 };
        }
        where.actividadId = actividadId;
      } else {
        where.actividadId = { in: allowedIds };
      }
    } else if (actividadId) {
      where.actividadId = actividadId;
    }

    const alumnoSearch = buildAlumnoSearch(search);
    const alumnoWhere = {
      ...(alumnoSearch ?? {}),
      ...(alumnoActivo !== undefined ? { activo: alumnoActivo } : {}),
    };
    if (Object.keys(alumnoWhere).length > 0) where.alumno = alumnoWhere;

    if (pagado !== undefined) where.pagado = pagado;
    if (conClases) where.clasesUsadas = { gt: 0 };

    const orderBy = sortBy === 'dni' ? { alumno: { dni: sortOrder } }
      : sortBy === 'alumno' ? [{ alumno: { apellido: sortOrder } }, { alumno: { nombre: sortOrder } }]
      : sortBy === 'actividad' ? { actividad: { nombre: sortOrder } }
      : sortBy === 'frecuencia' ? { frecuencia: sortOrder }
      : sortBy === 'clases' ? { clasesUsadas: sortOrder }
      : sortBy === 'pago' || sortBy === 'estado' ? { pagado: sortOrder }
      : [{ alumno: { apellido: 'asc' as const } }, { actividad: { nombre: 'asc' as const } }];

    const [data, total] = await Promise.all([
      this.prisma.inscripcionActividad.findMany({
        where,
        include: {
          alumno: {
            select: { id: true, dni: true, nombre: true, apellido: true, activo: true },
          },
          actividad: { select: { id: true, nombre: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.inscripcionActividad.count({ where }),
    ]);

    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  async estadisticas() {
    const [estadisticas] = await this.prisma.$queryRaw<{
      total: number;
      activas: number;
      historicas: number;
      pendientesPago: number;
    }[]>`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE a.activo)::int AS activas,
        COUNT(*) FILTER (WHERE NOT a.activo)::int AS historicas,
        COUNT(*) FILTER (WHERE a.activo AND NOT i.pagado AND i."clasesUsadas" > 0)::int AS "pendientesPago"
      FROM public."InscripcionActividad" i
      JOIN public."Alumno" a ON a.id = i."alumnoId"
    `;

    return estadisticas;
  }

  async findByAlumno(alumnoId: string, profesorId?: string) {
    const where: Record<string, unknown> = { alumnoId };
    if (profesorId) {
      const prof = await this.prisma.profesor.findUnique({
        where: { id: profesorId },
        select: { actividades: { select: { id: true } } },
      });
      where.actividadId = { in: prof?.actividades.map((a) => a.id) ?? [] };
    }
    return this.prisma.inscripcionActividad.findMany({
      where,
      include: { actividad: true },
      orderBy: { actividad: { nombre: 'asc' } },
    });
  }

  async create(dto: CreateInscripcionDto) {
    const alumno = await this.prisma.alumno.findUnique({ where: { id: dto.alumnoId } });
    if (!alumno) throw new NotFoundException('Alumno no encontrado');

    const actividad = await this.prisma.actividad.findUnique({ where: { id: dto.actividadId } });
    if (!actividad) throw new NotFoundException('Actividad no encontrada');

    const exists = await this.prisma.inscripcionActividad.findUnique({
      where: { alumnoId_actividadId: { alumnoId: dto.alumnoId, actividadId: dto.actividadId } },
    });
    if (exists) throw new ConflictException('El alumno ya está inscripto en esta actividad');

    const clasesTotal = await this.clasesParaFrecuencia(dto.frecuencia);

    try {
      return await this.prisma.inscripcionActividad.create({
        data: { alumnoId: dto.alumnoId, actividadId: dto.actividadId, frecuencia: dto.frecuencia, clasesTotal },
        include: { actividad: true, alumno: { select: { id: true, dni: true, nombre: true, apellido: true } } },
      });
    } catch (error) {
      // La restricción única es la defensa definitiva ante requests simultáneos.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('El alumno ya está inscripto en esta actividad');
      }
      throw error;
    }
  }

  async pagar(id: string, pagado: boolean, mesesAdelantados = 1) {
    const inscripcion = await this.prisma.inscripcionActividad.findUnique({ where: { id } });
    if (!inscripcion) throw new NotFoundException('Inscripción no encontrada');

    return this.prisma.$transaction(async (tx) => {
      const fechaPago = new Date();
      const updated = await tx.inscripcionActividad.update({
        where: { id },
        data: { pagado, fechaPago: pagado ? fechaPago : null },
        include: { actividad: true },
      });

      if (pagado) {
        const fechasPago = this.fechasPagoAdelantado(mesesAdelantados, fechaPago);
        await tx.pago.createMany({
          data: fechasPago.map((fecha, index) => ({
            alumnoId: inscripcion.alumnoId,
            inscripcionId: id,
            tipo: 'PAGO',
            fecha,
            registradoEn: fechaPago,
            nota: fechasPago.length > 1 ? `Pago adelantado ${index + 1}/${fechasPago.length}` : null,
          })),
        });
      } else {
        await tx.pago.create({
          data: {
            alumnoId: inscripcion.alumnoId,
            inscripcionId: id,
            tipo: 'ANULACION',
            fecha: fechaPago,
            registradoEn: fechaPago,
          },
        });
      }

      return updated;
    });
  }

  async agregarClasesSueltas(id: string, clases: number) {
    const inscripcion = await this.prisma.inscripcionActividad.findUnique({ where: { id } });
    if (!inscripcion) throw new NotFoundException('Inscripción no encontrada');

    return this.prisma.inscripcionActividad.update({
      where: { id },
      data: { clasesTotal: { increment: clases } },
      include: { actividad: true },
    });
  }

  /**
   * Ajuste manual de clases (ej. descontar/agregar una clase, corregir el
   * total). Setea los valores absolutos que vengan; valida rangos.
   */
  async ajustarClases(
    id: string,
    data: { clasesUsadas?: number; clasesTotal?: number },
  ) {
    const inscripcion = await this.prisma.inscripcionActividad.findUnique({
      where: { id },
    });
    if (!inscripcion) throw new NotFoundException('Inscripción no encontrada');

    const clasesTotal = data.clasesTotal ?? inscripcion.clasesTotal;
    const clasesUsadas = data.clasesUsadas ?? inscripcion.clasesUsadas;

    if (clasesUsadas > clasesTotal) {
      throw new ConflictException(
        'Las clases usadas no pueden superar el total',
      );
    }

    return this.prisma.inscripcionActividad.update({
      where: { id },
      data: { clasesTotal, clasesUsadas },
      include: { actividad: true },
    });
  }

  async cambiarFrecuencia(id: string, frecuencia: Frecuencia, clasesUsadas?: number) {
    const inscripcion = await this.prisma.inscripcionActividad.findUnique({ where: { id } });
    if (!inscripcion) throw new NotFoundException('Inscripción no encontrada');

    const clasesTotal = await this.clasesParaFrecuencia(frecuencia);
    const nuevasClasesUsadas = clasesUsadas ?? inscripcion.clasesUsadas;

    if (nuevasClasesUsadas > clasesTotal) {
      throw new ConflictException(
        'Las clases usadas no pueden superar el total de la frecuencia elegida',
      );
    }

    return this.prisma.inscripcionActividad.update({
      where: { id },
      data: { frecuencia, clasesTotal, clasesUsadas: nuevasClasesUsadas },
      include: { actividad: true },
    });
  }

  /**
   * Borrado en cascada: elimina la inscripción y el historial (pagos/ingresos)
   * ligado a ella, en una transacción. Irreversible.
   */
  async remove(id: string) {
    const inscripcion = await this.prisma.inscripcionActividad.findUnique({ where: { id } });
    if (!inscripcion) throw new NotFoundException('Inscripción no encontrada');
    return this.prisma.$transaction(async (tx) => {
      await tx.pago.deleteMany({ where: { inscripcionId: id } });
      await tx.ingreso.deleteMany({ where: { inscripcionId: id } });
      return tx.inscripcionActividad.delete({ where: { id } });
    });
  }

}
