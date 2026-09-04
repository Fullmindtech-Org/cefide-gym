import { Prisma, PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const BATCH_SIZE = 500;
const EXPECTED_SEED_STUDENTS = 19_595;

interface ContactRecord {
  dni: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  direccion: string | null;
  fechaNacimiento: string | null;
  fechaIngreso: string | null;
}

interface ContactPayload {
  metadata: {
    version: number;
    source: string;
    sourceSha256: string;
    stats: {
      alumnosSeed: number;
      conDatos: number;
    };
  };
  contacts: ContactRecord[];
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function isEmpty(value: string | null): boolean {
  return value === null || value.trim() === '';
}

function asDate(value: string | null): Date | null {
  return value ? new Date(`${value}T12:00:00.000Z`) : null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const dataPath = path.join(__dirname, 'contactos-faltantes.json');
  const payload: ContactPayload = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  if (payload.metadata.version !== 1) throw new Error('Version de datos no soportada');
  if (payload.metadata.stats.alumnosSeed !== EXPECTED_SEED_STUDENTS) {
    throw new Error('El archivo no corresponde al universo esperado del ultimo seed');
  }
  if (payload.contacts.length !== payload.metadata.stats.conDatos) {
    throw new Error('La cantidad de contactos no coincide con sus metadatos');
  }
  if (new Set(payload.contacts.map((contact) => contact.dni)).size !== payload.contacts.length) {
    throw new Error('El archivo contiene DNIs duplicados');
  }

  const [{ database }] = await prisma.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  const allowedDatabase = process.env.CONTACT_SEED_ALLOWED_DATABASE;
  if (apply && allowedDatabase !== database) {
    throw new Error(
      `Aplicacion bloqueada: CONTACT_SEED_ALLOWED_DATABASE debe ser exactamente "${database}"`,
    );
  }

  const currentStudents = await prisma.alumno.findMany({
    where: { dni: { in: payload.contacts.map((contact) => contact.dni) } },
    select: {
      dni: true,
      nombre: true,
      apellido: true,
      telefono: true,
      direccion: true,
      fechaNacimiento: true,
      fechaIngreso: true,
    },
  });
  const currentByDni = new Map(currentStudents.map((student) => [student.dni, student]));
  const missing: string[] = [];
  const identityMismatches: string[] = [];
  const updates: ContactRecord[] = [];
  const fieldCounts = { telefono: 0, direccion: 0, fechaNacimiento: 0, fechaIngreso: 0 };

  for (const contact of payload.contacts) {
    const current = currentByDni.get(contact.dni);
    if (!current) {
      missing.push(contact.dni);
      continue;
    }
    if (
      normalizeName(`${current.apellido} ${current.nombre}`) !==
      normalizeName(`${contact.apellido} ${contact.nombre}`)
    ) {
      identityMismatches.push(contact.dni);
      continue;
    }

    const update: ContactRecord = {
      ...contact,
      telefono: contact.telefono && isEmpty(current.telefono) ? contact.telefono : null,
      direccion: contact.direccion && isEmpty(current.direccion) ? contact.direccion : null,
      fechaNacimiento: contact.fechaNacimiento && !current.fechaNacimiento ? contact.fechaNacimiento : null,
      fechaIngreso: contact.fechaIngreso && !current.fechaIngreso ? contact.fechaIngreso : null,
    };
    if (update.telefono) fieldCounts.telefono++;
    if (update.direccion) fieldCounts.direccion++;
    if (update.fechaNacimiento) fieldCounts.fechaNacimiento++;
    if (update.fechaIngreso) fieldCounts.fechaIngreso++;
    if (update.telefono || update.direccion || update.fechaNacimiento || update.fechaIngreso) {
      updates.push(update);
    }
  }

  console.log('=== SEED CONTROLADO DE CONTACTOS ===');
  console.log(`Base: ${database}`);
  console.log(`Modo: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Fuente: ${payload.metadata.source} (${payload.metadata.sourceSha256})`);
  console.log(`Contactos preparados: ${payload.contacts.length}`);
  console.log(`Alumnos encontrados: ${currentStudents.length}`);
  console.log(`DNIs ausentes: ${missing.length}`);
  console.log(`Identidades distintas: ${identityMismatches.length}`);
  console.log(`Alumnos a actualizar: ${updates.length}`);
  console.log(`Telefonos a completar: ${fieldCounts.telefono}`);
  console.log(`Direcciones a completar: ${fieldCounts.direccion}`);
  console.log(`Fechas de nacimiento a completar: ${fieldCounts.fechaNacimiento}`);
  console.log(`Fechas de ingreso a completar: ${fieldCounts.fechaIngreso}`);

  if (missing.length) {
    console.log(`DNIs ausentes omitidos: ${missing.join(', ')}`);
  }
  if (identityMismatches.length) {
    throw new Error('Preflight fallido: uno o mas DNI pertenecen a otra identidad');
  }
  if (!apply) {
    console.log('Dry-run finalizado. No se escribio ningun dato.');
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      for (let index = 0; index < updates.length; index += BATCH_SIZE) {
        const batch = updates.slice(index, index + BATCH_SIZE);
        const values = batch.map((update) => Prisma.sql`(
          ${update.dni},
          ${update.telefono},
          ${update.direccion},
          ${asDate(update.fechaNacimiento)}::timestamp,
          ${asDate(update.fechaIngreso)}::timestamp
        )`);
        await tx.$executeRaw(Prisma.sql`
          UPDATE "Alumno" AS alumno
          SET
            "telefono" = CASE
              WHEN NULLIF(BTRIM(alumno."telefono"), '') IS NULL
                THEN data."telefono"
              ELSE alumno."telefono"
            END,
            "direccion" = CASE
              WHEN NULLIF(BTRIM(alumno."direccion"), '') IS NULL
                THEN data."direccion"
              ELSE alumno."direccion"
            END,
            "fechaNacimiento" = COALESCE(alumno."fechaNacimiento", data."fechaNacimiento"),
            "fechaIngreso" = COALESCE(alumno."fechaIngreso", data."fechaIngreso")
          FROM (VALUES ${Prisma.join(values)}) AS data(
            "dni", "telefono", "direccion", "fechaNacimiento", "fechaIngreso"
          )
          WHERE alumno."dni" = data."dni"
        `);
      }
    },
    { maxWait: 10_000, timeout: 300_000 },
  );

  console.log('Aplicacion completada correctamente.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
