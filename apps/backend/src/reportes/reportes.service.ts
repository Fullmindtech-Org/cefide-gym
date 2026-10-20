import { Injectable } from '@nestjs/common';
import { Frecuencia, Prisma } from '@prisma/client';
import { CRITERIO_DEUDORES_HISTORICO, periodoArgentina, rangoDeudoresHistorico } from './deudores-periodo';
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

export interface ReporteDeudor extends ReporteInscripcion {
  telefono: string | null;
}

export interface ReporteDeudorHistorico extends Omit<ReporteDeudor, 'clasesTotal' | 'clasesUsadas' | 'clasesRestantes'> {
  periodo: string;
  clasesTotal: null;
  clasesUsadas: null;
  clasesRestantes: null;
}

export type FilaDeudor = ReporteDeudor | ReporteDeudorHistorico;

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

  async periodosDeudores(ahora = new Date()): Promise<string[]> {
    const actual = periodoArgentina(ahora);
    const { _min } = await this.prisma.inscripcionActividad.aggregate({
      where: { alumno: { activo: true } }, _min: { creadoEn: true },
    });
    const primero = _min.creadoEn ? periodoArgentina(_min.creadoEn) : actual;
    const periodos = [actual];
    const [year, month] = actual.split('-').map(Number);
    const cursor = new Date(Date.UTC(year, month - 1, 1));
    while (true) {
      cursor.setUTCMonth(cursor.getUTCMonth() - 1);
      const previo = cursor.toISOString().slice(0, 7);
      if (previo < primero) break;
      periodos.push(previo);
    }
    return periodos;
  }

  async reporteDeudores(actividadId?: string, periodo?: string): Promise<FilaDeudor[]> {
    if (periodo !== undefined) return this.reporteDeudoresHistorico(periodo, actividadId);

    const where: Record<string, unknown> = {
      alumno: { activo: true },
      pagado: false,
      clasesUsadas: { gt: 0 },
    };
    if (actividadId) where.actividadId = actividadId;

    const inscripciones = await this.prisma.inscripcionActividad.findMany({
      where,
      include: {
        alumno: { select: { dni: true, nombre: true, apellido: true, telefono: true } },
        actividad: { select: { nombre: true } },
      },
      orderBy: [{ alumno: { apellido: 'asc' } }, { alumno: { nombre: 'asc' } }],
    });

    return inscripciones.map((i) => ({
      dni: i.alumno.dni,
      nombre: i.alumno.nombre,
      apellido: i.alumno.apellido,
      telefono: i.alumno.telefono,
      actividad: i.actividad.nombre,
      frecuencia: i.frecuencia,
      clasesTotal: i.clasesTotal,
      clasesUsadas: i.clasesUsadas,
      clasesRestantes: i.clasesTotal - i.clasesUsadas,
      pagado: i.pagado,
      fechaPago: i.fechaPago,
    }));
  }

  private async reporteDeudoresHistorico(periodo: string, actividadId?: string): Promise<ReporteDeudorHistorico[]> {
    const { inicio, fin } = rangoDeudoresHistorico(periodo);
    // Prisma guarda UTC en timestamp sin zona. Vincular texto UTC evita que la zona
    // de la sesión PostgreSQL desplace los límites al comparar con parámetros Date.
    const inicioUtc = inicio.toISOString();
    const finUtc = fin.toISOString();
    // Consulta parametrizada y de solo lectura. Los contadores actuales no representan el mes elegido.
    return this.prisma.$queryRaw<ReporteDeudorHistorico[]>(Prisma.sql`
      WITH ultimo_movimiento AS (
        SELECT DISTINCT ON ("inscripcionId") "inscripcionId", tipo
        FROM "Pago"
        WHERE fecha >= ${inicioUtc}::timestamp AND fecha < ${finUtc}::timestamp
          AND "inscripcionId" IS NOT NULL
        ORDER BY "inscripcionId", fecha DESC, id DESC
      )
      SELECT a.dni, a.nombre, a.apellido, a.telefono, act.nombre AS actividad,
        i.frecuencia, NULL::integer AS "clasesTotal", NULL::integer AS "clasesUsadas",
        NULL::integer AS "clasesRestantes", false AS pagado, NULL::timestamp AS "fechaPago",
        ${periodo}::text AS periodo
      FROM "InscripcionActividad" i
      JOIN "Alumno" a ON a.id = i."alumnoId"
      JOIN "Actividad" act ON act.id = i."actividadId"
      LEFT JOIN ultimo_movimiento u ON u."inscripcionId" = i.id
      WHERE a.activo = true AND i."creadoEn" < ${finUtc}::timestamp
        AND (u.tipo IS NULL OR u.tipo = 'ANULACION')
        AND EXISTS (
          SELECT 1 FROM "Ingreso" g
          WHERE g."inscripcionId" = i.id
            AND g."fechaHora" >= ${inicioUtc}::timestamp AND g."fechaHora" < ${finUtc}::timestamp
            AND g.estado IN ('VERDE', 'AMARILLO')
        )
        ${actividadId ? Prisma.sql`AND i."actividadId" = ${actividadId}` : Prisma.empty}
      ORDER BY a.apellido, a.nombre, act.nombre, a.dni
    `);
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

  // La tabla principal de ambas descargas refleja las nueve columnas visibles en la UI.
  private tablaDeudores(datos: FilaDeudor[], periodo?: string) {
    const frecuencias: Record<Frecuencia, string> = {
      CLASE_SUELTA: 'Clase Suelta', UNA_VEZ: '1x semana', DOS_VECES: '2x semana',
      TRES_VECES: '3x semana', CUATRO_VECES: '4x semana', CINCO_VECES: '5x semana',
      LIBRE: 'Libre', BECADO: 'Becado',
    };
    const headers = ['DNI', 'Nombre', 'Teléfono', 'Actividad', 'Frecuencia', 'Realizadas', 'Restantes', 'Pago', 'Estado'];
    const rows = datos.map((d) => {
      const estado = periodo
        ? d.frecuencia === 'BECADO' ? 'Becado: revisar' : 'Sin pago registrado'
        : (d.clasesRestantes ?? 0) > 0 ? d.pagado ? 'VERDE' : 'AMARILLO' : 'ROJO';
      return [
        d.dni, `${d.apellido}, ${d.nombre}`, d.telefono ?? '—', d.actividad,
        frecuencias[d.frecuencia as Frecuencia] ?? d.frecuencia,
        d.clasesUsadas ?? 'No disponible', d.clasesRestantes ?? 'No disponible',
        d.pagado ? 'Sí' : 'No', estado,
      ];
    });
    return { headers, rows };
  }

  generarCsvDeudores(datos: FilaDeudor[], periodo?: string): string {
    const { headers, rows } = this.tablaDeudores(datos, periodo);
    const escaparCsv = (value: string | number) => {
      const text = String(value);
      return /[;"\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    };
    return '\uFEFF' + [headers, ...rows].map((row) => row.map(escaparCsv).join(';')).join('\n');
  }

  generarExcelDeudores(datos: FilaDeudor[], periodo?: string): string {
    const escapeXml = (value: string | number) => String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const { headers, rows } = this.tablaDeudores(datos, periodo);
    const fila = (cells: (string | number)[], header = false) =>
      `<Row>${cells.map((cell) => `<Cell${header ? ' ss:StyleID="header"' : ''}><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join('')}</Row>`;

    const criterio = periodo
      ? '<Worksheet ss:Name="Criterio"><Table>' + fila(['Período', periodo], true) +
        fila(['Criterio', CRITERIO_DEUDORES_HISTORICO]) + '</Table></Worksheet>'
      : '';
    return `<?xml version="1.0"?>\n` +
      `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
      `<Styles><Style ss:ID="header"><Font ss:Bold="1"/></Style></Styles>` +
      `<Worksheet ss:Name="Deudores"><Table>${fila(headers, true)}${rows.map((row) => fila(row)).join('')}</Table></Worksheet>${criterio}</Workbook>`;
  }
}
