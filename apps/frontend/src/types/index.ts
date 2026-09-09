export type Frecuencia =
  | 'CLASE_SUELTA'
  | 'UNA_VEZ'
  | 'DOS_VECES'
  | 'TRES_VECES'
  | 'CUATRO_VECES'
  | 'CINCO_VECES'
  | 'LIBRE'
  | 'BECADO';

export const FRECUENCIA_LABEL: Record<Frecuencia, string> = {
  CLASE_SUELTA: 'Clase Suelta',
  UNA_VEZ: '1x semana',
  DOS_VECES: '2x semana',
  TRES_VECES: '3x semana',
  CUATRO_VECES: '4x semana',
  CINCO_VECES: '5x semana',
  LIBRE: 'Libre',
  BECADO: 'Becado',
};

export interface Actividad {
  id: string;
  nombre: string;
  activo: boolean;
  creadoEn: string;
  _count?: { inscripciones: number };
}

export interface InscripcionActividad {
  id: string;
  alumnoId: string;
  actividadId: string;
  actividad: { id: string; nombre: string };
  alumno?: { id: string; dni: string; nombre: string; apellido: string; activo: boolean };
  frecuencia: Frecuencia;
  clasesTotal: number;
  clasesUsadas: number;
  pagado: boolean;
  fechaPago: string | null;
  creadoEn: string;
}

export interface Alumno {
  id: string;
  dni: string;
  nombre: string;
  apellido: string;
  telefono?: string | null;
  direccion?: string | null;
  fechaNacimiento?: string | null;
  fechaIngreso?: string | null;
  observaciones?: string | null;
  activo: boolean;
  inscripciones?: InscripcionActividad[];
  creadoEn: string;
  actualizadoEn: string;
}

export interface Profesor {
  id: string;
  dni: string;
  nombre: string;
  apellido: string;
  usuario?: { id: string; email: string } | null;
  actividades?: { id: string; nombre: string }[];
  _count?: { alumnos: number };
}

export interface ConfigSistema {
  id: string;
  clasesGracia: number;
  diaVencimiento: number;
  clasesUnaVez: number;
  clasesDosVeces: number;
  clasesTresVeces: number;
  clasesCuatroVeces: number;
  clasesCincoVeces: number;
  clasesSuelta: number;
  clasesLibre: number;
  clasesBecado: number;
  tiempoVerde: number;
  tiempoAmarillo: number;
  tiempoRojo: number;
  reingresoVentanaMinutos: number;
  codigosComodin: string;
}

export const FRECUENCIAS: Frecuencia[] = [
  'CLASE_SUELTA',
  'UNA_VEZ',
  'DOS_VECES',
  'TRES_VECES',
  'CUATRO_VECES',
  'CINCO_VECES',
  'LIBRE',
  'BECADO',
];

export function clasesDeFrecuencia(config: ConfigSistema, frecuencia: Frecuencia): number {
  const clases: Record<Frecuencia, number> = {
    CLASE_SUELTA: config.clasesSuelta,
    UNA_VEZ: config.clasesUnaVez,
    DOS_VECES: config.clasesDosVeces,
    TRES_VECES: config.clasesTresVeces,
    CUATRO_VECES: config.clasesCuatroVeces,
    CINCO_VECES: config.clasesCincoVeces,
    LIBRE: config.clasesLibre,
    BECADO: config.clasesBecado,
  };
  return clases[frecuencia];
}

export function frecuenciaConClases(config: ConfigSistema, frecuencia: Frecuencia): string {
  const cantidad = clasesDeFrecuencia(config, frecuencia);
  return `${FRECUENCIA_LABEL[frecuencia]} (${cantidad} ${cantidad === 1 ? 'clase' : 'clases'})`;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}
