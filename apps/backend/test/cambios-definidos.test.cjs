const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const {validate}=require('class-validator');
const {PagarInscripcionDto}=require('../src/inscripciones/dto/pagar-inscripcion.dto');
const {InscripcionesService}=require('../src/inscripciones/inscripciones.service');
const {AccesoService}=require('../src/acceso/acceso.service');
const {ReportesService}=require('../src/reportes/reportes.service');
const {rangoMesActual,estadoAcceso}=require('../src/acceso/estado-acceso');
const {resumirAccesos}=require('../src/acceso/resumen-acceso');
const ahora=new Date('2026-10-18T15:00:00Z');

test('pago de septiembre y diciembre en octubre conserva la fecha real y no paga octubre',async t=>{
  t.mock.timers.enable({apis:['Date'],now:ahora.getTime()});
  let update,movimientos;
  const service=new InscripcionesService({
    inscripcionActividad:{findUnique:async()=>({alumnoId:'a'})},
    $transaction:async fn=>fn({inscripcionActividad:{update:async q=>{update=q.data;return q.data;}},pago:{createMany:async q=>{movimientos=q.data;}}}),
  });
  await service.pagar('i',true,1,['2026-09','2026-12']);
  assert.deepEqual(update,{});
  assert.deepEqual(movimientos.map(p=>p.fecha.toISOString()),['2026-09-01T15:00:00.000Z','2026-12-01T15:00:00.000Z']);
  assert(movimientos.every(p=>p.registradoEn.getTime()===ahora.getTime()));
  await service.pagar('i',true,1,['2026-10','2027-01']);
  assert.equal(update.pagado,true);
  await service.pagar('i',false,1,['2026-09'],'  Carga duplicada  ');
  assert.deepEqual(update,{});
  assert.equal(movimientos[0].nota,'Carga duplicada');
  assert.equal(movimientos[0].tipo,'ANULACION');
  await service.pagar('i',false,1,['2026-10'],'Error');
  assert.deepEqual(update,{pagado:false,fechaPago:null});
});

test('el backend rechaza anulación sin motivo y períodos inválidos antes de escribir',async()=>{
  const service=new InscripcionesService({});
  for(const motivo of [undefined,null,'','   ','x'.repeat(501)])
    await assert.rejects(service.pagar('i',false,1,['2026-10'],motivo),e=>e.getStatus()===400);
  for(const periodos of [[],null,['2026-13'],['2026-1'],['2026-10','2026-10'],['0000-01'],Array(13).fill('2026-10')])
    await assert.rejects(service.pagar('i',true,1,periodos),e=>e.getStatus()===400);
  for(const periodos of [[],['2026-10','2026-10'],['2026-13']])
    assert((await validate(Object.assign(new PagarInscripcionDto(),{pagado:true,periodos}))).length);
});

test('límites del mes argentino cerca de medianoche y de año',()=>{
  assert.equal(rangoMesActual(new Date('2027-01-01T02:30:00Z')).gte.toISOString(),'2026-12-01T03:00:00.000Z');
  assert.equal(rangoMesActual(new Date('2027-01-01T03:00:00Z')).gte.toISOString(),'2027-01-01T03:00:00.000Z');
});

test('la visualización respeta gracia, cupo y reingreso sin habilitar excedentes',async()=>{
  const ins={id:'i',pagado:false,clasesTotal:9,clasesUsadas:5,alumno:{activo:true}};
  let ingresos=[1,2,3,4,5].map(d=>({inscripcionId:'i',estado:'AMARILLO',fechaHora:new Date(`2026-10-${String(d).padStart(2,'0')}T15:00:00Z`)}));
  const db={configSistema:{findUnique:async()=>({clasesGracia:5,reingresoVentanaMinutos:180})},ingreso:{findMany:async()=>ingresos}};
  assert.equal((await resumirAccesos(db,[ins],ahora))[0].estadoAcceso,'ROJO');
  ingresos=ingresos.slice(0,2);
  assert.equal((await resumirAccesos(db,[ins],ahora))[0].estadoAcceso,'AMARILLO');
  const agotada={...ins,clasesTotal:1,clasesUsadas:1};
  assert.equal((await resumirAccesos(db,[agotada],ahora))[0].estadoAcceso,'ROJO');
  ingresos.push({inscripcionId:'i',estado:'AMARILLO',fechaHora:new Date(ahora.getTime()-60_000)});
  assert.equal((await resumirAccesos(db,[agotada],ahora))[0].estadoAcceso,'AMARILLO');
  assert.equal(estadoAcceso(ins,false,5,true).estado,'ROJO');
});

test('el molinete devuelve el contador posterior y el reingreso no consume otra clase ni gracia',async t=>{
  t.mock.timers.enable({apis:['Date'],now:ahora.getTime()});
  const ins={id:'i',alumnoId:'a',pagado:false,clasesTotal:9,clasesUsadas:0,actividad:{nombre:'AERO'}};
  const ingresos=[];
  const config={clasesGracia:5,reingresoVentanaMinutos:180};
  const tx={
    alumno:{findUnique:async()=>({id:'a',activo:true,nombre:'Prueba',apellido:'Acceso'})},
    inscripcionActividad:{findFirst:async()=>({...ins}),update:async()=>{ins.clasesUsadas++;}},
    configSistema:{findUnique:async()=>config},
    ingreso:{findMany:async()=>ingresos,findFirst:async()=>ingresos.at(-1)??null,create:async q=>{ingresos.push({...q.data,fechaHora:new Date()});}},
  };
  const service=new AccesoService({...tx,$transaction:async fn=>fn(tx)});
  let resultado=await service.validarYRegistrarAcceso('12345678','i');
  assert.equal(resultado.estado,'AMARILLO');
  assert.equal(resultado.clasesUsadas,1);assert.equal(resultado.clasesRestantes,8);
  assert.equal(resultado.clasesGraciaRestantes,4);
  resultado=await service.validarYRegistrarAcceso('12345678','i');
  assert.equal(resultado.clasesUsadas,1);assert.equal(resultado.clasesRestantes,8);
  assert.equal(resultado.clasesGraciaRestantes,4);assert.equal(ins.clasesUsadas,1);
  ins.pagado=true;
  resultado=await service.validarYRegistrarAcceso('12345678','i');
  assert.equal(resultado.estado,'VERDE');assert.equal(ins.clasesUsadas,1);
  ingresos.length=0;
  ins.clasesUsadas=0;
  resultado=await service.validarYRegistrarAcceso('12345678','i');
  assert.equal(resultado.clasesUsadas,1);assert.equal(resultado.clasesRestantes,8);
});

test('sumar clases y editar la misma frecuencia conserva el saldo y las consumidas',async()=>{
  const ins={id:'i',frecuencia:'CLASE_SUELTA',clasesTotal:3,clasesUsadas:2,pagado:false};
  const service=new InscripcionesService({inscripcionActividad:{
    findUnique:async()=>ins,
    update:async q=>{if(q.data.clasesTotal?.increment)ins.clasesTotal+=q.data.clasesTotal.increment;else Object.assign(ins,q.data);return {...ins};},
  }});
  await service.agregarClasesSueltas('i',2);
  await service.agregarClasesSueltas('i',1);
  assert.equal(ins.clasesTotal,6);assert.equal(ins.clasesUsadas,2);assert.equal(ins.pagado,false);
  await service.cambiarFrecuencia('i','CLASE_SUELTA',2);
  assert.equal(ins.clasesTotal,6);assert.equal(ins.clasesUsadas,2);
});

const databaseUrl=process.env.REPORTES_TEST_DATABASE_URL;
test('PostgreSQL: cobertura retroactiva, anulación y repago se ordenan por fecha real; asistencias y saldo', {skip:!databaseUrl},async()=>{
  assert(['localhost','127.0.0.1'].includes(new URL(databaseUrl).hostname));
  const temporalUrl=new URL(databaseUrl);
  temporalUrl.searchParams.set('schema','pg_temp');
  const db=new PrismaClient({datasources:{db:{url:temporalUrl.toString()}}});
  const rollback=new Error('rollback');
  try {
    await assert.rejects(db.$transaction(async tx=>{
      for(const nombre of ['Alumno','Actividad','InscripcionActividad','Pago','Ingreso','ConfigSistema'])
        await tx.$executeRawUnsafe('CREATE TEMP TABLE "'+nombre+'" (LIKE public."'+nombre+'" INCLUDING DEFAULTS) ON COMMIT DROP');
      for(const [nombre,tabla,columna] of [['Frecuencia','InscripcionActividad','frecuencia'],['TipoPago','Pago','tipo'],['EstadoIngreso','Ingreso','estado']]) {
        const valores=require('@prisma/client').Prisma.dmmf.datamodel.enums.find(e=>e.name===nombre).values.map(v=>"'"+v.name+"'").join(',');
        await tx.$executeRawUnsafe('CREATE TYPE pg_temp."'+nombre+'" AS ENUM ('+valores+')');
        await tx.$executeRawUnsafe('ALTER TABLE pg_temp."'+tabla+'" ALTER COLUMN "'+columna+'" TYPE pg_temp."'+nombre+'" USING "'+columna+'"::text::pg_temp."'+nombre+'"');
      }
      // La copia local puede ser anterior a la migración ya existente de fecha real.
      await tx.$executeRawUnsafe('ALTER TABLE pg_temp."Pago" ADD COLUMN IF NOT EXISTS "registradoEn" TIMESTAMP(3) DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE \'UTC\')');
      await tx.$executeRawUnsafe('INSERT INTO pg_temp."ConfigSistema" SELECT * FROM public."ConfigSistema"');
      const clave='prueba-'+require('node:crypto').randomUUID();
      const alumno=await tx.alumno.create({data:{dni:clave,nombre:'Prueba',apellido:clave}});
      const actividad=await tx.actividad.create({data:{nombre:clave}});
      const ins=await tx.inscripcionActividad.create({data:{alumnoId:alumno.id,actividadId:actividad.id,frecuencia:'CLASE_SUELTA',clasesTotal:1}});
      const service=new InscripcionesService({...tx,$transaction:async fn=>fn(tx)});
      // El pago inicial tiene cobertura posterior al día usado por el selector.
      await tx.pago.create({data:{alumnoId:alumno.id,inscripcionId:ins.id,tipo:'PAGO',fecha:new Date('2024-09-25T15:00:00Z'),registradoEn:new Date('2024-09-25T15:00:00Z')}});
      await tx.inscripcionActividad.update({where:{id:ins.id},data:{creadoEn:new Date('2024-08-01')}});
      await tx.ingreso.create({data:{alumnoId:alumno.id,inscripcionId:ins.id,estado:'AMARILLO',fechaHora:new Date('2024-09-10T15:00:00Z')}});
      // El ingreso de gracia es anterior al pago: su color histórico no implica deuda.
      assert.equal((await new ReportesService(tx).reporteDeudores(actividad.id,'2024-09')).length,0);
      await service.pagar(ins.id,false,1,['2024-09'],'Error de carga');
      let deudores=await new ReportesService(tx).reporteDeudores(actividad.id,'2024-09');
      assert.equal(deudores.length,1);
      assert.equal(deudores[0].inscripcionId,ins.id);
      assert.equal(deudores[0].actividadId,actividad.id);
      await tx.pago.updateMany({where:{inscripcionId:ins.id,tipo:'ANULACION'},data:{registradoEn:new Date('2025-01-01')}});
      await service.pagar(ins.id,true,1,['2024-09','2027-01']);
      deudores=await new ReportesService(tx).reporteDeudores(actividad.id,'2024-09');
      assert.equal(deudores.length,0);
      assert.equal((await tx.ingreso.findFirst({where:{inscripcionId:ins.id}})).estado,'AMARILLO');
      assert.equal((await tx.inscripcionActividad.findUnique({where:{id:ins.id}})).pagado,false);
      const antes=await service.findAll({actividadId:actividad.id,conClases:true});
      assert.equal(antes.total,0);
      assert.equal((await service.findAll({actividadId:actividad.id})).total,1);
      await tx.ingreso.create({data:{alumnoId:alumno.id,inscripcionId:ins.id,estado:'ROJO'}});
      assert.equal((await service.findAll({actividadId:actividad.id,conClases:true})).total,0);
      await tx.ingreso.create({data:{alumnoId:alumno.id,inscripcionId:ins.id,estado:'AMARILLO'}});
      assert.equal((await service.findAll({actividadId:actividad.id,conClases:true})).total,1);
      await service.agregarClasesSueltas(ins.id,2);
      await service.cambiarFrecuencia(ins.id,'CLASE_SUELTA',1);
      const final=await tx.inscripcionActividad.findUnique({where:{id:ins.id}});
      assert.equal(final.clasesTotal,3);assert.equal(final.clasesUsadas,1);
      throw rollback;
    },{timeout:20000}),e=>e===rollback);
  } finally {await db.$disconnect();}
});
