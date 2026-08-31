import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ReporteInscripcion {
  dni: string;
  nombre: string;
  apellido: string;
  actividad: string;
  frecuencia: string;
  clasesTotal: number;
  clasesUsadas: number;
  clasesRestantes: number;
  pagado: boolean;
  fechaPago: Date | null;
}

@Injectable()
export class ReportesService {
  constructor(private readonly prisma: PrismaService) {}

  async reporteActividad(actividadId?: string, profesorId?: string): Promise<ReporteInscripcion[]> {
    const where: Record<string, unknown> = { alumno: { activo: true } };

    if (profesorId) {
      const prof = await this.prisma.profesor.findUnique({
        where: { id: profesorId },
        select: { actividades: { select: { id: true } } },
      });
      const allowedIds = prof?.actividades.map((a) => a.id) ?? [];
      if (actividadId) {
        if (!allowedIds.includes(actividadId)) return [];
        where.actividadId = actividadId;
      } else {
        where.actividadId = { in: allowedIds };
      }
    } else if (actividadId) {
      where.actividadId = actividadId;
    }

    const inscripciones = await this.prisma.inscripcionActividad.findMany({
      where,
      include: {
        alumno: { select: { dni: true, nombre: true, apellido: true } },
        actividad: { select: { nombre: true } },
      },
      orderBy: [{ alumno: { apellido: 'asc' } }, { alumno: { nombre: 'asc' } }],
    });

    return inscripciones.map((i) => ({
      dni: i.alumno.dni,
      nombre: i.alumno.nombre,
      apellido: i.alumno.apellido,
      actividad: i.actividad.nombre,
      frecuencia: i.frecuencia,
      clasesTotal: i.clasesTotal,
      clasesUsadas: i.clasesUsadas,
      clasesRestantes: i.clasesTotal - i.clasesUsadas,
      pagado: i.pagado,
      fechaPago: i.fechaPago,
    }));
  }

  generarCsv(datos: ReporteInscripcion[]): string {
    const headers = [
      'DNI',
      'Apellido',
      'Nombre',
      'Actividad',
      'Frecuencia',
      'Clases Total',
      'Clases Realizadas',
      'Clases Restantes',
      'Pagado',
      'Fecha Pago',
    ];

    const rows = datos.map((d) => [
      d.dni,
      d.apellido,
      d.nombre,
      d.actividad,
      d.frecuencia,
      d.clasesTotal,
      d.clasesUsadas,
      d.clasesRestantes,
      d.pagado ? 'Sí' : 'No',
      d.fechaPago ? new Date(d.fechaPago).toLocaleDateString('es-AR') : '',
    ]);

    const bom = '﻿';
    return bom + [headers, ...rows].map((r) => r.join(';')).join('\n');
  }
}
