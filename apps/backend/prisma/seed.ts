import { PrismaClient, Rol, Frecuencia } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function upsertActividad(nombre: string) {
  return prisma.actividad.upsert({
    where: { nombre },
    update: {},
    create: { nombre },
  });
}

async function upsertAlumno(data: {
  dni: string;
  nombre: string;
  apellido: string;
  activo?: boolean;
}) {
  return prisma.alumno.upsert({
    where: { dni: data.dni },
    update: {},
    create: { activo: true, ...data },
  });
}

async function upsertInscripcion(params: {
  alumnoId: string;
  actividadId: string;
  frecuencia: Frecuencia;
  clasesTotal: number;
  clasesUsadas: number;
  pagado: boolean;
}) {
  const { alumnoId, actividadId, ...rest } = params;
  return prisma.inscripcionActividad.upsert({
    where: { alumnoId_actividadId: { alumnoId, actividadId } },
    update: { ...rest, fechaPago: rest.pagado ? new Date() : null },
    create: {
      alumnoId,
      actividadId,
      ...rest,
      fechaPago: rest.pagado ? new Date() : null,
    },
  });
}

async function main() {
  // Config global del sistema (incluye tiempos de pantalla del molinete)
  await prisma.configSistema.upsert({
    where: { id: 'global' },
    update: {},
    create: {
      id: 'global',
      clasesGracia: 5,
      diaVencimiento: 5,
      tiempoVerde: 4,
      tiempoAmarillo: 5,
      tiempoRojo: 6,
      reingresoVentanaMinutos: 180,
    },
  });
  console.log('✓ ConfigSistema');

  // Usuario ADMIN
  const adminPassword = await bcrypt.hash('admin123', 10);
  await prisma.usuario.upsert({
    where: { email: 'admin@cefide.com' },
    update: {},
    create: { email: 'admin@cefide.com', password: adminPassword, rol: Rol.ADMIN },
  });
  console.log('✓ Usuario admin (admin@cefide.com / admin123)');

  // Actividades
  const pilates = await upsertActividad('Pilates');
  const spinning = await upsertActividad('Spinning');
  const funcional = await upsertActividad('Funcional');
  console.log('✓ Actividades: Pilates, Spinning, Funcional');

  // Profesor de prueba a cargo de Pilates y Spinning (NO Funcional)
  const profesor = await prisma.profesor.upsert({
    where: { dni: '12345678' },
    update: { actividades: { set: [{ id: pilates.id }, { id: spinning.id }] } },
    create: {
      dni: '12345678',
      nombre: 'Juan',
      apellido: 'Pérez',
      actividades: { connect: [{ id: pilates.id }, { id: spinning.id }] },
    },
  });

  const profePassword = await bcrypt.hash('profe123', 10);
  await prisma.usuario.upsert({
    where: { email: 'juan@cefide.com' },
    update: {},
    create: {
      email: 'juan@cefide.com',
      password: profePassword,
      rol: Rol.PROFESOR,
      profesorId: profesor.id,
    },
  });
  console.log('✓ Profesor Juan Pérez (juan@cefide.com / profe123) — Pilates + Spinning');

  // Martín: pago al día (VERDE) e inscripto en 2 actividades → prueba selección por número
  const martin = await upsertAlumno({ dni: '40111222', nombre: 'Martín', apellido: 'González' });
  await upsertInscripcion({
    alumnoId: martin.id, actividadId: pilates.id,
    frecuencia: Frecuencia.DOS_VECES, clasesTotal: 12, clasesUsadas: 5, pagado: true,
  });
  await upsertInscripcion({
    alumnoId: martin.id, actividadId: spinning.id,
    frecuencia: Frecuencia.UNA_VEZ, clasesTotal: 5, clasesUsadas: 2, pagado: true,
  });
  console.log('✓ Martín González (40111222) — VERDE, Pilates + Spinning (multi-actividad)');

  // Lucía: sin pago pero con gracia (AMARILLO)
  const lucia = await upsertAlumno({ dni: '40333444', nombre: 'Lucía', apellido: 'Ramírez' });
  await upsertInscripcion({
    alumnoId: lucia.id, actividadId: pilates.id,
    frecuencia: Frecuencia.UNA_VEZ, clasesTotal: 8, clasesUsadas: 6, pagado: false,
  });
  console.log('✓ Lucía Ramírez (40333444) — AMARILLO, sin pago');

  // Diego: sin clases (ROJO)
  const diego = await upsertAlumno({ dni: '40555666', nombre: 'Diego', apellido: 'Fernández' });
  await upsertInscripcion({
    alumnoId: diego.id, actividadId: spinning.id,
    frecuencia: Frecuencia.UNA_VEZ, clasesTotal: 8, clasesUsadas: 8, pagado: false,
  });
  console.log('✓ Diego Fernández (40555666) — ROJO, sin clases');

  // Sofía: inactiva e inscripta en Funcional (que NO es de Juan) → Juan no debe verla
  const sofia = await upsertAlumno({ dni: '40777888', nombre: 'Sofía', apellido: 'López', activo: false });
  await upsertInscripcion({
    alumnoId: sofia.id, actividadId: funcional.id,
    frecuencia: Frecuencia.UNA_VEZ, clasesTotal: 0, clasesUsadas: 0, pagado: false,
  });
  console.log('✓ Sofía López (40777888) — INACTIVA, Funcional (fuera del scope de Juan)');

  console.log('\nSeed completado.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
