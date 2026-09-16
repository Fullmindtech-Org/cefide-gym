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

export interface ReporteDeudor extends ReporteInscripcion {}

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

  async reporteDeudores(actividadId?: string): Promise<ReporteDeudor[]> {
    const where: Record<string, unknown> = {
      alumno: { activo: true },
      pagado: false,
    };
    if (actividadId) where.actividadId = actividadId;

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

  generarExcelDeudores(datos: ReporteDeudor[]): string {
    const escapeXml = (value: string | number) => String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const headers = ['DNI', 'Apellido', 'Nombre', 'Actividad', 'Frecuencia', 'Clases restantes', 'Estado de pago'];
    const rows = datos.map((d) => [
      d.dni, d.apellido, d.nombre, d.actividad, d.frecuencia,
      d.clasesRestantes, d.pagado ? 'Pagado' : 'Adeuda',
    ]);
    const fila = (cells: (string | number)[], header = false) =>
      `<Row>${cells.map((cell) => `<Cell${header ? ' ss:StyleID="header"' : ''}><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join('')}</Row>`;

    return `<?xml version="1.0"?>\n` +
      `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
      `<Styles><Style ss:ID="header"><Font ss:Bold="1"/></Style></Styles>` +
      `<Worksheet ss:Name="Deudores"><Table>${fila(headers, true)}${rows.map((row) => fila(row)).join('')}</Table></Worksheet></Workbook>`;
  }
}
