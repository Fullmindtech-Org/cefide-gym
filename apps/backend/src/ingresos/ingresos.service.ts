import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EstadoIngreso } from '@prisma/client';
import { buildAlumnoSearch } from '../common/alumno-search';

interface FindAllParams {
  desde?: string;
  hasta?: string;
  alumnoId?: string;
  estado?: EstadoIngreso;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  profesorId?: string;
}

@Injectable()
export class IngresosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: FindAllParams) {
    const { desde, hasta, alumnoId, estado, search, page = 1, limit = 30, profesorId, sortBy, sortOrder = 'desc' } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (profesorId) {
      const prof = await this.prisma.profesor.findUnique({
        where: { id: profesorId },
        select: { actividades: { select: { id: true } } },
      });
      const actividadIds = prof?.actividades.map((a) => a.id) ?? [];
      where.inscripcion = { actividadId: { in: actividadIds } };
    }

    if (desde || hasta) {
      where.fechaHora = {};
      if (desde) (where.fechaHora as Record<string, unknown>).gte = new Date(desde);
      if (hasta) {
        const hastaDate = new Date(hasta);
        hastaDate.setHours(23, 59, 59, 999);
        (where.fechaHora as Record<string, unknown>).lte = hastaDate;
      }
    }

    if (alumnoId) where.alumnoId = alumnoId;
    if (estado) where.estado = estado;

    const alumnoSearch = buildAlumnoSearch(search);
    if (alumnoSearch) where.alumno = alumnoSearch;

    const orderBy = sortBy === 'dni' ? { alumno: { dni: sortOrder } }
      : sortBy === 'nombre' ? [{ alumno: { apellido: sortOrder } }, { alumno: { nombre: sortOrder } }]
      : sortBy === 'estado' ? { estado: sortOrder }
      : sortBy === 'molinete' ? { molinete: sortOrder }
      : { fechaHora: sortOrder };

    const [data, total] = await Promise.all([
      this.prisma.ingreso.findMany({
        where,
        include: {
          alumno: {
            select: { dni: true, nombre: true, apellido: true },
          },
          inscripcion: {
            include: { actividad: { select: { nombre: true } } },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.ingreso.count({ where }),
    ]);

    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }
}
