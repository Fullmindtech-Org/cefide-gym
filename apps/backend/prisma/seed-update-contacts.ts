/**
 * seed-update-contacts.ts — Actualiza teléfono y dirección de alumnos existentes.
 *
 * Idempotente: solo actualiza campos vacíos (no pisa datos ya ingresados).
 * Fuente: contactos-prod.json (generado del CSV alumnos_version8).
 * Cobertura: 295/319 alumnos del seed. 24 sin datos en CSV original.
 *
 * Uso (desde el servidor, dentro del contenedor):
 *   docker exec -it cefide-backend \
 *     node -e "require('ts-node/register'); require('./prisma/seed-update-contacts.ts');"
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface Contacto {
  dni: string;
  telefono: string | null;
  direccion: string | null;
}

async function main() {
  const jsonPath = path.join(__dirname, 'contactos-prod.json');
  const contactos: Contacto[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  console.log(`=== UPDATE CONTACTOS CEFIDE (${contactos.length} registros) ===\n`);

  let actualizados = 0;
  let sinCambios = 0;
  let noEncontrados = 0;

  for (const c of contactos) {
    const alumno = await prisma.alumno.findUnique({ where: { dni: c.dni } });

    if (!alumno) {
      console.warn(`  [NOT FOUND] DNI ${c.dni}`);
      noEncontrados++;
      continue;
    }

    // Solo actualizar campos que están vacíos en la DB
    const update: { telefono?: string; direccion?: string } = {};
    if (!alumno.telefono && c.telefono) update.telefono = c.telefono;
    if (!alumno.direccion && c.direccion) update.direccion = c.direccion;

    if (Object.keys(update).length === 0) {
      sinCambios++;
      continue;
    }

    await prisma.alumno.update({ where: { dni: c.dni }, data: update });
    actualizados++;
  }

  console.log(`✓ Actualizados: ${actualizados}`);
  console.log(`- Sin cambios (ya tenían datos): ${sinCambios}`);
  console.log(`- No encontrados en DB: ${noEncontrados}`);
  console.log(`- Sin datos en CSV (24): no incluidos en el JSON`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
