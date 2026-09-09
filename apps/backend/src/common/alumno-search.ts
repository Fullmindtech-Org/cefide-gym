import { Prisma } from '@prisma/client';

/**
 * Construye una búsqueda general de alumnos por palabras.
 *
 * Cada término debe aparecer en alguno de los campos buscables, lo que permite
 * combinar apellido y nombre en cualquier orden (por ejemplo, "Abasto Gisele"
 * o "Gisele Abasto") sin perder las búsquedas parciales existentes.
 */
export function buildAlumnoSearch(search?: string): Prisma.AlumnoWhereInput | undefined {
  const terms = search
    ?.trim()
    .split(/[\s,]+/)
    .filter(Boolean);

  if (!terms?.length) return undefined;

  return {
    AND: terms.map((term) => ({
      OR: [
        { dni: { contains: term } },
        { nombre: { contains: term, mode: 'insensitive' } },
        { apellido: { contains: term, mode: 'insensitive' } },
        { telefono: { contains: term, mode: 'insensitive' } },
        { direccion: { contains: term, mode: 'insensitive' } },
      ],
    })),
  };
}
