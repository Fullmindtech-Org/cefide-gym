import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Frecuencia } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInscripcionDto } from './dto/create-inscripcion.dto';

interface FindAllParams {
  search?: string;
  actividadId?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class InscripcionesService {
  constructor(private readonly prisma: PrismaService) {}

  private async clasesParaFrecuencia(frecuencia: Frecuencia): Promise<number> {
    const config = await this.prisma.configSistema.findUnique({
      where: { id: 'global' },
    });
    const map: Record<Frecuencia, number> = {
      UNA_VEZ: config?.clasesUnaVez ?? 5,
      DOS_VECES: config?.clasesDosVeces ?? 9,
      TRES_VECES: config?.clasesTresVeces ?? 13,
      LIBRE: config?.clasesLibre ?? 30,
    };
    return map[frecuencia];
  }

  async findAll(params: FindAllParams) {
    const { search, actividadId, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (actividadId) where.actividadId = actividadId;
    if (search) {
      where.alumno = {
        OR: [
          { dni: { contains: search } },
          { nombre: { contains: search, mode: 'insensitive' } },
          { apellido: { contains: search, mode: 'insensitive' } },
          { telefono: { contains: search, mode: 'insensitive' } },
          { direccion: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.inscripcionActividad.findMany({
        where,
        include: {
          alumno: {
            select: { id: true, dni: true, nombre: true, apellido: true, activo: true },
          },
          actividad: { select: { id: true, nombre: true } },
        },
        orderBy: [{ alumno: { apellido: 'asc' } }, { actividad: { nombre: 'asc' } }],
        skip,
        take: limit,
      }),
      this.prisma.inscripcionActividad.count({ where }),
    ]);

    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  async findByAlumno(alumnoId: string) {
    return this.prisma.inscripcionActividad.findMany({
      where: { alumnoId },
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

    return this.prisma.inscripcionActividad.create({
      data: { alumnoId: dto.alumnoId, actividadId: dto.actividadId, frecuencia: dto.frecuencia, clasesTotal },
      include: { actividad: true, alumno: { select: { id: true, dni: true, nombre: true, apellido: true } } },
    });
  }

  async pagar(id: string, pagado: boolean) {
    const inscripcion = await this.prisma.inscripcionActividad.findUnique({ where: { id } });
    if (!inscripcion) throw new NotFoundException('Inscripción no encontrada');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.inscripcionActividad.update({
        where: { id },
        data: { pagado, fechaPago: pagado ? new Date() : null },
        include: { actividad: true },
      });

      await tx.pago.create({
        data: {
          alumnoId: inscripcion.alumnoId,
          inscripcionId: id,
          tipo: pagado ? 'PAGO' : 'ANULACION',
        },
      });

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

  async cambiarFrecuencia(id: string, frecuencia: Frecuencia) {
    const inscripcion = await this.prisma.inscripcionActividad.findUnique({ where: { id } });
    if (!inscripcion) throw new NotFoundException('Inscripción no encontrada');

    const clasesTotal = await this.clasesParaFrecuencia(frecuencia);

    return this.prisma.inscripcionActividad.update({
      where: { id },
      data: { frecuencia, clasesTotal },
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

  async renovacionMensual() {
    const result = await this.prisma.inscripcionActividad.updateMany({
      data: { clasesUsadas: 0, pagado: false, fechaPago: null },
    });
    return { renovadas: result.count };
  }
}
