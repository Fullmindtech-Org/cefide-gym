export type Frecuencia = 'UNA_VEZ' | 'DOS_VECES' | 'TRES_VECES' | 'LIBRE';

export const FRECUENCIA_LABEL: Record<Frecuencia, string> = {
  UNA_VEZ: '1x semana',
  DOS_VECES: '2x semana',
  TRES_VECES: '3x semana',
  LIBRE: 'Libre',
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
  clasesLibre: number;
  tiempoVerde: number;
  tiempoAmarillo: number;
  tiempoRojo: number;
  reingresoVentanaMinutos: number;
  codigosComodin: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}
