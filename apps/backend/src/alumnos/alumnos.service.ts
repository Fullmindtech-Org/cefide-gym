import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Frecuencia } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAlumnoDto } from './dto/create-alumno.dto';
import { UpdateAlumnoDto } from './dto/update-alumno.dto';

interface FindAllParams {
  search?: string;
  activo?: boolean;
  page?: number;
  limit?: number;
  /** Si viene, limita los alumnos/inscripciones a las actividades de este profesor. */
  profesorId?: string;
}

export interface ImportRowError {
  linea: number;
  motivo: string;
}

export interface ImportCsvResult {
  total: number;
  creados: number;
  actualizados: number;
  inscripcionesCreadas: number;
  omitidos: number;
  errores: ImportRowError[];
}

@Injectable()
export class AlumnosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: FindAllParams) {
    const { search, activo, page = 1, limit = 20, profesorId } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { dni: { contains: search } },
        { nombre: { contains: search, mode: 'insensitive' } },
        { apellido: { contains: search, mode: 'insensitive' } },
        { telefono: { contains: search, mode: 'insensitive' } },
        { direccion: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (activo !== undefined) {
      where.activo = activo;
    }

    // Scope por profesor: solo alumnos inscriptos en las actividades del profesor.
    let actividadIds: string[] | null = null;
    if (profesorId) {
      const prof = await this.prisma.profesor.findUnique({
        where: { id: profesorId },
        select: { actividades: { select: { id: true } } },
      });
      actividadIds = prof?.actividades.map((a) => a.id) ?? [];
      where.inscripciones = { some: { actividadId: { in: actividadIds } } };
    }

    const inscripcionesInclude = {
      include: { actividad: true },
      orderBy: { actividad: { nombre: 'asc' } },
      ...(actividadIds ? { where: { actividadId: { in: actividadIds } } } : {}),
    } as const;

    const [data, total] = await Promise.all([
      this.prisma.alumno.findMany({
        where,
        orderBy: { apellido: 'asc' },
        skip,
        take: limit,
        include: { inscripciones: inscripcionesInclude },
      }),
      this.prisma.alumno.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, profesorId?: string) {
    let actividadIds: string[] | null = null;
    if (profesorId) {
      const prof = await this.prisma.profesor.findUnique({
        where: { id: profesorId },
        select: { actividades: { select: { id: true } } },
      });
      actividadIds = prof?.actividades.map((a) => a.id) ?? [];
    }

    const alumno = await this.prisma.alumno.findUnique({
      where: { id },
      include: {
        inscripciones: {
          where: actividadIds ? { actividadId: { in: actividadIds } } : undefined,
          include: { actividad: true },
          orderBy: { actividad: { nombre: 'asc' } },
        },
      },
    });

    if (!alumno) throw new NotFoundException('Alumno no encontrado');

    if (actividadIds !== null && alumno.inscripciones.length === 0) {
      throw new ForbiddenException('Sin acceso a este alumno');
    }

    return alumno;
  }

  async create(dto: CreateAlumnoDto) {
    const exists = await this.prisma.alumno.findUnique({
      where: { dni: dto.dni },
    });

    if (exists) {
      throw new ConflictException('Ya existe un alumno con ese DNI');
    }

    const data = {
      ...dto,
      fechaNacimiento: dto.fechaNacimiento ? new Date(dto.fechaNacimiento) : undefined,
      fechaIngreso: dto.fechaIngreso ? new Date(dto.fechaIngreso) : undefined,
    };
    return this.prisma.alumno.create({ data });
  }

  async update(id: string, dto: UpdateAlumnoDto) {
    await this.findOne(id);

    if (dto.dni) {
      const exists = await this.prisma.alumno.findFirst({
        where: { dni: dto.dni, NOT: { id } },
      });
      if (exists) {
        throw new ConflictException('Ya existe un alumno con ese DNI');
      }
    }

    const data = {
      ...dto,
      fechaNacimiento: dto.fechaNacimiento ? new Date(dto.fechaNacimiento) : undefined,
      fechaIngreso: dto.fechaIngreso ? new Date(dto.fechaIngreso) : undefined,
    };
    return this.prisma.alumno.update({ where: { id }, data });
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.alumno.update({
      where: { id },
      data: { activo: false },
    });
  }

  async activate(id: string) {
    await this.findOne(id);
    return this.prisma.alumno.update({
      where: { id },
      data: { activo: true },
    });
  }

  /**
   * Borrado en cascada: elimina el alumno junto a todo su historial vinculado
   * (pagos, ingresos e inscripciones) en una transacción. Irreversible.
   */
  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.pago.deleteMany({ where: { alumnoId: id } });
      await tx.ingreso.deleteMany({ where: { alumnoId: id } });
      await tx.inscripcionActividad.deleteMany({ where: { alumnoId: id } });
      return tx.alumno.delete({ where: { id } });
    });
  }

  /**
   * Importa alumnos desde un CSV (formato del parser VERSION8):
   *   dni, nombre, apellido, domicilio, telefono, localidad, actividad, activo
   *
   * Acepta separador tab, `;` o `,` (auto-detectado) y campos entre comillas.
   * También reconoce las columnas opcionales `clases_total`, `clases_usadas`
   * y `pagado` (mismo criterio que prisma/migracion/migrate.ts).
   * `domicilio`/`direccion` y `telefono` se persisten en el Alumno; `localidad`
   * es informativa (el modelo no la guarda).
   *
   * Es idempotente: upsert por DNI. Cada fila crea/actualiza Alumno +
   * Actividad (por nombre) + Inscripción. No se detiene ante errores.
   */
  async importFromCsv(buffer: Buffer): Promise<ImportCsvResult> {
    const content = this.decodeCsvBuffer(buffer);
    const rows = this.parseCsv(content);

    const result: ImportCsvResult = {
      total: rows.length,
      creados: 0,
      actualizados: 0,
      inscripcionesCreadas: 0,
      omitidos: 0,
      errores: [],
    };

    const actividadCache = new Map<string, string>();
    const dnisSeen = new Map<string, number>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const linea = i + 2; // +2 por header + índice base 0

      const dniRaw = row['dni'] || row['documento'] || row['nro_doc'] || '';
      const nombre = row['nombre'] || '';
      const apellido = row['apellido'] || '';
      const activoRaw = row['activo'] || row['estado'] || '1';
      const telefono =
        (row['telefono'] || row['tel'] || row['celular'] || '').trim() || null;
      const direccion =
        (row['domicilio'] || row['direccion'] || row['dirección'] || '').trim() ||
        null;
      const actividadNombre = (row['actividad'] || '').trim();
      const clasesTotal = parseInt(row['clases_total'] || row['clases'] || '0', 10);
      const clasesUsadas = parseInt(row['clases_usadas'] || '0', 10);
      const pagadoRaw = row['pagado'] || '';

      // Validar DNI
      const dni = this.normalizeDni(dniRaw);
      if (!dni) {
        result.errores.push({ linea, motivo: `DNI inválido: "${dniRaw}"` });
        continue;
      }

      // Duplicados dentro del archivo
      if (dnisSeen.has(dni)) {
        result.errores.push({
          linea,
          motivo: `DNI duplicado en el archivo (ya importado en línea ${dnisSeen.get(dni)})`,
        });
        result.omitidos++;
        continue;
      }
      dnisSeen.set(dni, linea);

      if (!nombre || !apellido) {
        result.errores.push({ linea, motivo: 'Nombre o apellido vacío' });
        continue;
      }

      const activo = ['1', 'true', 'si', 'sí', 's', 'activo'].includes(
        activoRaw.toLowerCase(),
      );
      const pagado = ['1', 'true', 'si', 'sí', 's'].includes(
        pagadoRaw.toLowerCase(),
      );
      const total = isNaN(clasesTotal) ? 0 : clasesTotal;
      const usadas = isNaN(clasesUsadas) ? 0 : clasesUsadas;

      try {
        // 1) Alumno (upsert por DNI)
        const existente = await this.prisma.alumno.findUnique({
          where: { dni },
        });
        const alumno = existente
          ? await this.prisma.alumno.update({
              where: { dni },
              data: { nombre, apellido, activo, telefono, direccion },
            })
          : await this.prisma.alumno.create({
              data: { dni, nombre, apellido, activo, telefono, direccion },
            });

        if (existente) result.actualizados++;
        else result.creados++;

        // 2) Actividad + Inscripción (solo si la fila trae actividad)
        if (actividadNombre) {
          const actividadId = await this.getActividadId(
            actividadNombre,
            actividadCache,
          );

          const inscripcionExistente =
            await this.prisma.inscripcionActividad.findUnique({
              where: {
                alumnoId_actividadId: { alumnoId: alumno.id, actividadId },
              },
            });

          if (!inscripcionExistente) {
            await this.prisma.inscripcionActividad.create({
              data: {
                alumnoId: alumno.id,
                actividadId,
                frecuencia: this.frecuenciaDesdeClases(total),
                clasesTotal: total,
                clasesUsadas: usadas,
                pagado,
                fechaPago: pagado ? new Date() : null,
              },
            });
            result.inscripcionesCreadas++;
          }
        }
      } catch (err) {
        result.errores.push({
          linea,
          motivo: `Error DB: ${(err as Error).message}`,
        });
      }
    }

    return result;
  }

  /** Upsert idempotente de Actividad por nombre, con cache en memoria. */
  private async getActividadId(
    nombre: string,
    cache: Map<string, string>,
  ): Promise<string> {
    const cached = cache.get(nombre);
    if (cached) return cached;
    const act = await this.prisma.actividad.upsert({
      where: { nombre },
      update: {},
      create: { nombre },
    });
    cache.set(nombre, act.id);
    return act.id;
  }

  /** Infiere la frecuencia a partir del total de clases (igual que migrate.ts). */
  private frecuenciaDesdeClases(clasesTotal: number): Frecuencia {
    if (clasesTotal >= 30) return Frecuencia.LIBRE;
    if (clasesTotal >= 13) return Frecuencia.TRES_VECES;
    if (clasesTotal >= 9) return Frecuencia.DOS_VECES;
    return Frecuencia.UNA_VEZ;
  }

  /** Normaliza DNI: remueve puntos, guiones y espacios; exige 7-8 dígitos. */
  private normalizeDni(raw: string): string | null {
    const cleaned = raw.replace(/[.\-\s]/g, '');
    if (!/^\d{7,8}$/.test(cleaned)) return null;
    return cleaned;
  }

  /** Decodifica el buffer como UTF-8; si hay caracteres inválidos usa latin1. */
  private decodeCsvBuffer(buffer: Buffer): string {
    const utf8 = buffer.toString('utf-8');
    return utf8.includes('�') ? buffer.toString('latin1') : utf8;
  }

  /**
   * Parsea CSV con soporte de campos entre comillas.
   * Auto-detecta el separador (tab, `;` o `,`) mirando la primera línea.
   */
  private parseCsv(content: string): Record<string, string>[] {
    const firstLine = content.split(/\r?\n/, 1)[0] ?? '';
    const sep = firstLine.includes('\t')
      ? '\t'
      : firstLine.includes(';')
        ? ';'
        : ',';

    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;

    const pushField = () => {
      row.push(field);
      field = '';
    };
    const pushRow = () => {
      if (row.length > 1 || (row[0] ?? '').trim()) rows.push(row);
      row = [];
    };

    for (let i = 0; i < content.length; i++) {
      const c = content[i];
      if (inQuotes) {
        if (c === '"') {
          if (content[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === sep) {
        pushField();
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && content[i + 1] === '\n') i++;
        pushField();
        pushRow();
      } else {
        field += c;
      }
    }
    pushField();
    pushRow();

    if (rows.length < 2) return [];

    const headers = rows[0].map((h) => h.trim().toLowerCase());
    return rows.slice(1).map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = (r[i] ?? '').trim();
      });
      return obj;
    });
  }

  async renovacionMensual(): Promise<{ renovados: number }> {
    const config = await this.prisma.configSistema.findUnique({ where: { id: 'global' } });
    const clasesPorFrecuencia: Record<string, number> = {
      UNA_VEZ:    config?.clasesUnaVez    ?? 5,
      DOS_VECES:  config?.clasesDosVeces  ?? 9,
      TRES_VECES: config?.clasesTresVeces ?? 13,
      LIBRE:      config?.clasesLibre     ?? 30,
    };

    const inscripciones = await this.prisma.inscripcionActividad.findMany({
      where: { alumno: { activo: true } },
      select: { id: true, frecuencia: true },
    });

    await Promise.all([
      ...inscripciones.map((ins) =>
        this.prisma.inscripcionActividad.update({
          where: { id: ins.id },
          data: {
            clasesUsadas: 0,
            pagado: false,
            clasesTotal: clasesPorFrecuencia[ins.frecuencia] ?? 5,
          },
        }),
      ),
      this.prisma.configSistema.update({
        where: { id: 'global' },
        data: { ultimaRenovacion: new Date() },
      }),
    ]);

    return { renovados: inscripciones.length };
  }
}
