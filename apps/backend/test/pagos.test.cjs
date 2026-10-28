const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PrismaClient}=require('@prisma/client');
const {InscripcionesService}=require('../src/inscripciones/inscripciones.service');
const {ReportesController}=require('../src/reportes/reportes.controller');
const {filtroFechaPagos}=require('../src/reportes/filtro-fecha-pagos');
const instante=new Date('2026-10-08T10:41:25.321Z');

test('un cobro de tres meses guarda un instante real único y conserva tres coberturas',async t=>{
  t.mock.timers.enable({apis:['Date'],now:instante.getTime()});
  let pagoData,actualizacion;
  const service=new InscripcionesService({
    inscripcionActividad:{findUnique:async()=>({id:'i',alumnoId:'a'})},
    $transaction:async run=>run({inscripcionActividad:{update:async input=>{actualizacion=input.data;return input.data;}},pago:{createMany:async input=>{pagoData=input.data;}}}),
  });
  await service.pagar('i',true,3);
  assert.deepEqual(pagoData.map(p=>p.fecha.toISOString()),['2026-10-08T10:41:25.321Z','2026-11-08T10:41:25.000Z','2026-12-08T10:41:25.000Z']);
  assert(pagoData.every(p=>p.registradoEn.getTime()===instante.getTime()));
  assert.equal(actualizacion.fechaPago.getTime(),instante.getTime());
  assert.deepEqual(pagoData.map(p=>p.nota),['Pago adelantado 1/3','Pago adelantado 2/3','Pago adelantado 3/3']);
});

test('pago de un mes y anulación conservan fecha real y una sola operación',async t=>{
  t.mock.timers.enable({apis:['Date'],now:instante.getTime()});
  let movimientos=[];
  const service=new InscripcionesService({
    inscripcionActividad:{findUnique:async()=>({id:'i',alumnoId:'a'})},
    $transaction:async run=>run({inscripcionActividad:{update:async x=>x.data},pago:{createMany:async x=>{movimientos=x.data;},create:async x=>{movimientos=[x.data];}}}),
  });
  await service.pagar('i',true);
  assert.equal(movimientos.length,1);assert.equal(movimientos[0].nota,null);
  assert.equal(movimientos[0].fecha.getTime(),instante.getTime());
  assert.equal(movimientos[0].registradoEn.getTime(),instante.getTime());
  await service.pagar('i',false);
  assert.equal(movimientos[0].tipo,'ANULACION');
  assert.equal(movimientos[0].fecha.getTime(),instante.getTime());
  assert.equal(movimientos[0].registradoEn.getTime(),instante.getTime());
});

test('adelantos siguen ajustando fin de mes, año y horario argentino',()=>{
  const service=new InscripcionesService({});
  assert.deepEqual(service.fechasPagoAdelantado(3,new Date('2024-01-31T02:30:00.123Z')).map(d=>d.toISOString()),['2024-01-31T02:30:00.123Z','2024-03-01T02:30:00.000Z','2024-03-31T02:30:00.000Z']);
  assert.deepEqual(service.fechasPagoAdelantado(2,new Date('2026-12-31T15:00:00.123Z')).map(d=>d.toISOString()),['2026-12-31T15:00:00.123Z','2027-01-31T15:00:00.000Z']);
});

test('el filtro de mes conserva la cobertura y el rango de fechas usa el instante real',()=>{
  const mes=filtroFechaPagos('2026-10');
  assert.equal(mes.fecha.gte.toISOString(),'2026-10-01T03:00:00.000Z');
  assert.equal(mes.fecha.lt.toISOString(),'2026-11-01T03:00:00.000Z');
  const rango=filtroFechaPagos(undefined,'2026-10-08','2026-10-08');
  assert.equal(rango.registradoEn.gte.toISOString(),'2026-10-08T03:00:00.000Z');
  assert.equal(rango.registradoEn.lt.toISOString(),'2026-10-09T03:00:00.000Z');
  assert.deepEqual(filtroFechaPagos(),{});
  for(const args of [['2026-13'],[undefined,'2026-02-30'],[undefined,'2026-10-09','2026-10-08']])assert.throws(()=>filtroFechaPagos(...args),e=>e.getStatus()===400);
});

test('el historial expone fecha real sin cambiar fecha de cobertura ni inventar adelantos legados',async()=>{
  const rows=[{id:'nuevo',fecha:new Date('2026-12-08T10:41:25Z'),registradoEn:instante,nota:'Pago adelantado 3/3'},
    {id:'normal',fecha:instante,registradoEn:null,nota:null},
    {id:'sin-evidencia',fecha:new Date('2026-12-08T10:41:25Z'),registradoEn:null,nota:'Pago adelantado 3/3'}];
  let consulta;
  const controller=new ReportesController({}, {pago:{findMany:async q=>{consulta=q;return rows;},count:async()=>3}});
  const result=await controller.historialPagos(undefined,undefined,undefined,'2026-12');
  assert.equal(result.data[0].fechaImpacto,instante);
  assert.equal(result.data[0].fecha.toISOString(),'2026-12-08T10:41:25.000Z');
  assert.equal(result.data[1].fechaImpacto,instante);
  assert.equal(result.data[2].fechaImpacto,null);
  assert(consulta.where.fecha);assert(!consulta.where.registradoEn);
  assert.deepEqual(consulta.orderBy[0],{registradoEn:{sort:'desc',nulls:'last'}});
});

const databaseUrl=process.env.REPORTES_TEST_DATABASE_URL;
test('migración aditiva: recupera adelantos inequívocos y no altera las coberturas', {skip:!databaseUrl},async()=>{
  assert(['localhost','127.0.0.1'].includes(new URL(databaseUrl).hostname));
  const db=new PrismaClient({datasources:{db:{url:databaseUrl}}});
  const rollback=new Error('rollback');
  try{
    await assert.rejects(db.$transaction(async tx=>{
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "Pago" (LIKE public."Pago" INCLUDING DEFAULTS) ON COMMIT DROP');
      await tx.$executeRawUnsafe('ALTER TABLE "Pago" DROP COLUMN IF EXISTS "registradoEn"');
      await tx.$executeRawUnsafe(`INSERT INTO "Pago" (id,"alumnoId","inscripcionId",tipo,fecha,nota) VALUES
      ('normal','a','i','PAGO','2026-10-08 10:41:25.321',NULL),
      ('anulacion','a','i','ANULACION','2026-10-09 10:00',NULL),
      ('primero','a','i','PAGO','2026-10-08 10:41:25.321','Pago adelantado 1/3'),
      ('segundo','a','i','PAGO','2026-11-08 10:41:25','Pago adelantado 2/3'),
      ('tercero','a','i','PAGO','2026-12-08 10:41:25','Pago adelantado 3/3'),
      ('huerfano','b','j','PAGO','2026-11-08 10:41:25','Pago adelantado 2/3'),
      ('ene','c','k','PAGO','2024-01-31 02:30:00.123','Pago adelantado 1/2'),
      ('feb','c','k','PAGO','2024-03-01 02:30:00','Pago adelantado 2/2'),
      ('ambiguo1','d','l','PAGO','2026-10-08 10:41:25.123','Pago adelantado 1/2'),
      ('ambiguo2','d','l','PAGO','2026-10-08 10:41:25.456','Pago adelantado 1/2'),
      ('ambiguo','d','l','PAGO','2026-11-08 10:41:25','Pago adelantado 2/2'),
      ('otra-inscripcion','a','otra','PAGO','2026-11-08 10:41:25','Pago adelantado 2/3')`);
      const before=await tx.$queryRawUnsafe('SELECT * FROM "Pago" ORDER BY id');
      const sql=fs.readFileSync(path.join(__dirname,'../prisma/migrations/20261019000000_pago_registrado_en/migration.sql'),'utf8').replace(/^BEGIN;|^COMMIT;/gm,'');
      for(const statement of sql.split(';').filter(s=>s.trim()))await tx.$executeRawUnsafe(statement);
      const after=await tx.$queryRawUnsafe('SELECT p.* FROM "Pago" p ORDER BY p.id');
      assert.deepEqual(after.map(({registradoEn,...original})=>original),before);
      const byId=Object.fromEntries(after.map(r=>[r.id,r]));
      for(const id of ['normal','primero','segundo','tercero'])assert.equal(byId[id].registradoEn.toISOString(),instante.toISOString());
      assert.equal(byId.feb.registradoEn.toISOString(),'2024-01-31T02:30:00.123Z');
      for(const id of ['huerfano','ambiguo','otra-inscripcion'])assert.equal(byId[id].registradoEn,null);
      assert.equal(byId.anulacion.registradoEn.toISOString(),'2026-10-09T10:00:00.000Z');
      const defaultSql=fs.readFileSync(path.join(__dirname,'../prisma/migrations/20261019010000_pago_registrado_en_default/migration.sql'),'utf8');
      await tx.$executeRawUnsafe(defaultSql);
      const [clock]=await tx.$queryRawUnsafe(`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS instante`);
      for(const [index,timezone] of ['UTC','America/Argentina/Buenos_Aires'].entries()) {
        await tx.$executeRawUnsafe("SET LOCAL TIME ZONE '"+timezone+"'");
        await tx.$executeRaw`INSERT INTO "Pago" (id,"alumnoId",tipo,fecha) VALUES (${'viejo-escritor-'+index},'a','PAGO','2027-01-08 10:41:25')`;
        const [row]=await tx.$queryRaw`SELECT "registradoEn" FROM "Pago" WHERE id=${'viejo-escritor-'+index}`;
        assert(Math.abs(row.registradoEn.getTime()-clock.instante.getTime())<=1);
      }
      throw rollback;
    },{timeout:20000}),e=>e===rollback);
  }finally{await db.$disconnect();}
});
