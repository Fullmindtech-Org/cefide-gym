import { Injectable, NotFoundException } from '@nestjs/common';
import { EstadoIngreso } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DNIS_COMODIN_DEFAULT = ['00000000', '99999999'];

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

  async validarAcceso(dni: string, inscripcionId: string | null): Promise<ResultadoAcceso> {
    if ((await this.getCodigosComodin()).includes(dni)) {
      return {
        estado: EstadoIngreso.VERDE,
        alumno: { nombre: 'ACCESO', apellido: 'AUTORIZADO', dni },
        clasesRestantes: 999,
        clasesGraciaRestantes: 0,
        mensaje: 'Acceso libre',
      };
    }

    const alumno = await this.prisma.alumno.findUnique({ where: { dni } });

    if (!alumno) throw new NotFoundException('DNI no registrado');

    if (!alumno.activo) {
      return {
        estado: EstadoIngreso.ROJO,
        alumno: { nombre: alumno.nombre, apellido: alumno.apellido, dni },
        clasesRestantes: 0,
        clasesGraciaRestantes: 0,
        mensaje: 'Alumno inactivo — acceso bloqueado',
      };
    }

    if (!inscripcionId) {
      return {
        estado: EstadoIngreso.ROJO,
        alumno: { nombre: alumno.nombre, apellido: alumno.apellido, dni },
        clasesRestantes: 0,
        clasesGraciaRestantes: 0,
        mensaje: 'Seleccionar actividad',
      };
    }

    const inscripcion = await this.prisma.inscripcionActividad.findFirst({
      where: { id: inscripcionId, alumnoId: alumno.id },
      include: { actividad: { select: { nombre: true } } },
    });

    if (!inscripcion) {
      return {
        estado: EstadoIngreso.ROJO,
        alumno: { nombre: alumno.nombre, apellido: alumno.apellido, dni },
        clasesRestantes: 0,
        clasesGraciaRestantes: 0,
        mensaje: 'Inscripción no válida',
      };
    }

    const config = await this.prisma.configSistema.findUnique({ where: { id: 'global' } });
    const clasesGraciaMax = config?.clasesGracia ?? 2;
    const clasesRestantes = inscripcion.clasesTotal - inscripcion.clasesUsadas;
    const actividad = inscripcion.actividad.nombre;

    if (clasesRestantes <= 0) {
      return {
        estado: EstadoIngreso.ROJO,
        alumno: { nombre: alumno.nombre, apellido: alumno.apellido, dni },
        clasesRestantes: 0,
        clasesGraciaRestantes: 0,
        mensaje: `Sin clases disponibles en ${actividad}`,
        actividad,
      };
    }

    // Esta pasada consume una clase (el incremento ocurre en registrarIngreso).
    // Reportamos las clases que quedarán DESPUÉS de esta pasada.
    const clasesRestantesPost = clasesRestantes - 1;

    if (inscripcion.pagado) {
      return {
        estado: EstadoIngreso.VERDE,
        alumno: { nombre: alumno.nombre, apellido: alumno.apellido, dni },
        clasesRestantes: clasesRestantesPost,
        clasesGraciaRestantes: 0,
        mensaje: `Acceso permitido — ${clasesRestantesPost} clase(s) restante(s) en ${actividad}`,
        actividad,
      };
    }

    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    const ingresosGracia = await this.prisma.ingreso.count({
      where: {
        inscripcionId,
        estado: EstadoIngreso.AMARILLO,
        fechaHora: { gte: inicioMes },
      },
    });

    const clasesGraciaRestantes = clasesGraciaMax - ingresosGracia;

    if (clasesGraciaRestantes > 0) {
      return {
        estado: EstadoIngreso.AMARILLO,
        alumno: { nombre: alumno.nombre, apellido: alumno.apellido, dni },
        clasesRestantes: clasesRestantesPost,
        clasesGraciaRestantes,
        mensaje: `${clasesGraciaRestantes} clase(s) de gracia en ${actividad}. Regularizar pago.`,
        actividad,
      };
    }

    return {
      estado: EstadoIngreso.ROJO,
      alumno: { nombre: alumno.nombre, apellido: alumno.apellido, dni },
      clasesRestantes,
      clasesGraciaRestantes: 0,
      mensaje: `Sin clases de gracia — regularizar pago para ${actividad}`,
      actividad,
    };
  }

  async registrarIngreso(
    dni: string,
    inscripcionId: string | null,
    estado: EstadoIngreso,
    molinete: number = 1,
  ) {
    const alumno = await this.prisma.alumno.findUnique({ where: { dni } });
    if (!alumno) return;

    if ((await this.getCodigosComodin()).includes(dni)) {
      return this.prisma.ingreso.create({
        data: { alumnoId: alumno.id, estado, molinete },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const ingreso = await tx.ingreso.create({
        data: { alumnoId: alumno.id, inscripcionId, estado, molinete },
      });

      if (estado !== EstadoIngreso.ROJO && inscripcionId) {
        await tx.inscripcionActividad.update({
          where: { id: inscripcionId },
          data: { clasesUsadas: { increment: 1 } },
        });
      }

      return ingreso;
    });
  }
}
