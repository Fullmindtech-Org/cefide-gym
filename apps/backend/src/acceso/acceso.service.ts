import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EstadoIngreso, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DNIS_COMODIN_DEFAULT = ['00000000', '99999999'];
const REINGRESO_VENTANA_MINUTOS_DEFAULT = 180;

function contarSesionesDeGracia(fechas: Date[], ventanaReingresoMs: number): number {
  let sesiones = 0;
  let ultimoIngreso: Date | null = null;
  for (const fecha of fechas) {
    if (!ultimoIngreso || fecha.getTime() - ultimoIngreso.getTime() >= ventanaReingresoMs) {
      sesiones++;
    }
    ultimoIngreso = fecha;
  }
  return sesiones;
}

export interface ResultadoAcceso {
  estado: EstadoIngreso;
  alumno: {
    nombre: string;
    apellido: string;
    dni: string;
  };
  clasesRestantes: number;
  clasesGraciaRestantes: number;
  mensaje: string;
  actividad?: string;
}

export interface ConsultaAcceso {
  alumno: {
    id: string;
    nombre: string;
    apellido: string;
    dni: string;
  };
  activo: boolean;
  esComodin: boolean;
  inscripciones: {
    id: string;
    actividadId: string;
    actividad: string;
    frecuencia: string;
    clasesRestantes: number;
    pagado: boolean;
  }[];
}

@Injectable()
export class AccesoService {
  private readonly logger = new Logger(AccesoService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** DNIs comodín (acceso ilimitado) configurables desde el panel. */
  private async getCodigosComodin(): Promise<string[]> {
    const config = await this.prisma.configSistema.findUnique({ where: { id: 'global' } });
    const raw = config?.codigosComodin;
    if (!raw) return DNIS_COMODIN_DEFAULT;
    const codigos = raw
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    return codigos.length > 0 ? codigos : DNIS_COMODIN_DEFAULT;
  }

  /** Config pública para el kiosco (sin auth): tiempos de pantalla por estado, en segundos. */
  async getKioscoConfig() {
    const config = await this.prisma.configSistema.findUnique({ where: { id: 'global' } });
    return {
      tiempoVerde: config?.tiempoVerde ?? 4,
      tiempoAmarillo: config?.tiempoAmarillo ?? 5,
      tiempoRojo: config?.tiempoRojo ?? 6,
    };
  }

  async consultarAcceso(dni: string): Promise<ConsultaAcceso> {
    if ((await this.getCodigosComodin()).includes(dni)) {
      return {
        alumno: { id: 'comodin', nombre: 'ACCESO', apellido: 'AUTORIZADO', dni },
        activo: true,
        esComodin: true,
        inscripciones: [],
      };
    }

    const alumno = await this.prisma.alumno.findUnique({
      where: { dni },
      include: {
        inscripciones: {
          include: { actividad: { select: { nombre: true } } },
          orderBy: { actividad: { nombre: 'asc' } },
        },
      },
    });

    if (!alumno) throw new NotFoundException('DNI no registrado');

    return {
      alumno: { id: alumno.id, nombre: alumno.nombre, apellido: alumno.apellido, dni },
      activo: alumno.activo,
      esComodin: false,
      inscripciones: alumno.inscripciones.map((i) => ({
        id: i.id,
        actividadId: i.actividadId,
        actividad: i.actividad.nombre,
        frecuencia: i.frecuencia,
        clasesRestantes: i.clasesTotal - i.clasesUsadas,
        pagado: i.pagado,
      })),
    };
  }

  /**
   * Valida el acceso y registra el ingreso en una sola transacción serializable.
   * Elimina la condición de carrera del read-then-write separado (C2).
   */
  async validarYRegistrarAcceso(
    dni: string,
    inscripcionId: string | null,
    molinete: number = 1,
  ): Promise<ResultadoAcceso> {
    // Comodín: no depende de contadores, sin transacción serializable necesaria.
    if ((await this.getCodigosComodin()).includes(dni)) {
      this.logger.warn(`[COMODIN] Acceso comodín usado: DNI=${dni} molinete=${molinete}`);
      const alumno = await this.prisma.alumno.findUnique({ where: { dni } });
      if (alumno) {
        await this.prisma.ingreso.create({
          data: { alumnoId: alumno.id, estado: EstadoIngreso.VERDE, molinete },
        });
      }
      return {
        estado: EstadoIngreso.VERDE,
        alumno: { nombre: 'ACCESO', apellido: 'AUTORIZADO', dni },
        clasesRestantes: 999,
        clasesGraciaRestantes: 0,
        mensaje: 'Acceso libre',
      };
    }

    // Reintentos ante error de serialización (P2034) por requests concurrentes.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const alumno = await tx.alumno.findUnique({ where: { dni } });
            if (!alumno) throw new NotFoundException('DNI no registrado');

            if (!alumno.activo) {
              await tx.ingreso.create({
                data: { alumnoId: alumno.id, inscripcionId: null, estado: EstadoIngreso.ROJO, molinete },
              });
              return {
                estado: EstadoIngreso.ROJO,
                alumno: { nombre: alumno.nombre, apellido: alumno.apellido, dni },
                clasesRestantes: 0,
                clasesGraciaRestantes: 0,
                mensaje: 'Alumno inactivo — acceso bloqueado',
              };
            }

            if (!inscripcionId) {
              await tx.ingreso.create({
                data: { alumnoId: alumno.id, inscripcionId: null, estado: EstadoIngreso.ROJO, molinete },
              });
              return {
                estado: EstadoIngreso.ROJO,
                alumno: { nombre: alumno.nombre, apellido: alumno.apellido, dni },
                clasesRestantes: 0,
                clasesGraciaRestantes: 0,
                mensaje: 'Seleccionar actividad',
              };
            }

            const inscripcion = await tx.inscripcionActividad.findFirst({
              where: { id: inscripcionId, alumnoId: alumno.id },
              include: { actividad: { select: { nombre: true } } },
            });

            if (!inscripcion) {
              await tx.ingreso.create({
                data: { alumnoId: alumno.id, inscripcionId, estado: EstadoIngreso.ROJO, molinete },
              });
              return {
                estado: EstadoIngreso.ROJO,
                alumno: { nombre: alumno.nombre, apellido: alumno.apellido, dni },
                clasesRestantes: 0,
                clasesGraciaRestantes: 0,
                mensaje: 'Inscripción no válida',
              };
            }

            const config = await tx.configSistema.findUnique({ where: { id: 'global' } });
            const clasesGraciaMax = config?.clasesGracia ?? 5;
            const ventanaReingresoMs =
              (config?.reingresoVentanaMinutos ?? REINGRESO_VENTANA_MINUTOS_DEFAULT) * 60 * 1000;
            const clasesRestantes = inscripcion.clasesTotal - inscripcion.clasesUsadas;
            const actividad = inscripcion.actividad.nombre;
            const inicioMes = new Date();
            inicioMes.setDate(1);
            inicioMes.setHours(0, 0, 0, 0);
            const ingresosAmarillos = inscripcion.pagado
              ? []
              : await tx.ingreso.findMany({
                  where: {
                    inscripcionId,
                    estado: EstadoIngreso.AMARILLO,
                    fechaHora: { gte: inicioMes },
                  },
                  select: { fechaHora: true },
                  orderBy: { fechaHora: 'asc' },
                });
            const sesionesGracia = contarSesionesDeGracia(
              ingresosAmarillos.map((ingreso) => ingreso.fechaHora),
              ventanaReingresoMs,
            );

            // Un reingreso a la misma actividad dentro de la ventana configurada forma
            // parte de la misma asistencia. Se registra para auditoría, pero
            // no vuelve a descontar una clase ni una unidad de gracia.
            const inicioVentanaReingreso = new Date(Date.now() - ventanaReingresoMs);
            const ingresoReciente = await tx.ingreso.findFirst({
              where: {
                inscripcionId,
                estado: { in: [EstadoIngreso.VERDE, EstadoIngreso.AMARILLO] },
                fechaHora: { gte: inicioVentanaReingreso },
              },
              orderBy: { fechaHora: 'desc' },
            });

            if (ingresoReciente) {
              const estadoReingreso = inscripcion.pagado
                ? EstadoIngreso.VERDE
                : EstadoIngreso.AMARILLO;
              await tx.ingreso.create({
                data: { alumnoId: alumno.id, inscripcionId, estado: estadoReingreso, molinete },
              });
              return {
                estado: estadoReingreso,
                alumno: { nombre: alumno.nombre, apellido: alumno.apellido, dni },
                clasesRestantes,
                clasesGraciaRestantes: inscripcion.pagado
                  ? 0
                  : Math.max(0, clasesGraciaMax - sesionesGracia),
                mensaje: `Reingreso permitido sin descontar otra clase en ${actividad}`,
                actividad,
              };
            }

            if (clasesRestantes <= 0) {
              await tx.ingreso.create({
                data: { alumnoId: alumno.id, inscripcionId, estado: EstadoIngreso.ROJO, molinete },
              });
              return {
                estado: EstadoIngreso.ROJO,
                alumno: { nombre: alumno.nombre, apellido: alumno.apellido, dni },
                clasesRestantes: 0,
                clasesGraciaRestantes: 0,
                mensaje: `Sin clases disponibles en ${actividad}`,
                actividad,
              };
            }

            const clasesRestantesPost = clasesRestantes - 1;

            if (inscripcion.pagado) {
              await tx.ingreso.create({
                data: { alumnoId: alumno.id, inscripcionId, estado: EstadoIngreso.VERDE, molinete },
              });
              await tx.inscripcionActividad.update({
                where: { id: inscripcionId },
                data: { clasesUsadas: { increment: 1 } },
              });
              return {
                estado: EstadoIngreso.VERDE,
                alumno: { nombre: alumno.nombre, apellido: alumno.apellido, dni },
                clasesRestantes: clasesRestantesPost,
                clasesGraciaRestantes: 0,
                mensaje: `Acceso permitido — ${clasesRestantesPost} clase(s) restante(s) en ${actividad}`,
                actividad,
              };
            }

            // Sin pago — verificar clases de gracia.
            const clasesGraciaRestantes = clasesGraciaMax - sesionesGracia;

            if (clasesGraciaRestantes > 0) {
              await tx.ingreso.create({
                data: { alumnoId: alumno.id, inscripcionId, estado: EstadoIngreso.AMARILLO, molinete },
              });
              await tx.inscripcionActividad.update({
                where: { id: inscripcionId },
                data: { clasesUsadas: { increment: 1 } },
              });
              return {
                estado: EstadoIngreso.AMARILLO,
                alumno: { nombre: alumno.nombre, apellido: alumno.apellido, dni },
                clasesRestantes: clasesRestantesPost,
                clasesGraciaRestantes: clasesGraciaRestantes - 1,
                mensaje: `${clasesGraciaRestantes - 1} clase(s) de gracia restante(s) en ${actividad}. Regularizar pago.`,
                actividad,
              };
            }

            await tx.ingreso.create({
              data: { alumnoId: alumno.id, inscripcionId, estado: EstadoIngreso.ROJO, molinete },
            });
            return {
              estado: EstadoIngreso.ROJO,
              alumno: { nombre: alumno.nombre, apellido: alumno.apellido, dni },
              clasesRestantes,
              clasesGraciaRestantes: 0,
              mensaje: `Sin clases de gracia — regularizar pago para ${actividad}`,
              actividad,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (e) {
        // P2034: serialization failure por requests concurrentes — reintentar.
        if (e?.code === 'P2034' && attempt < 2) continue;
        throw e;
      }
    }
    // Unreachable: el loop siempre retorna o lanza antes de llegar aquí.
    throw new Error('validarYRegistrarAcceso: máximo de reintentos alcanzado');
  }
}
