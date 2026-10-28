const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { Rol } = require('@prisma/client');
const { ReportesService } = require('../src/reportes/reportes.service');
const { ReportesController } = require('../src/reportes/reportes.controller');
const { rangoDeudoresHistorico, CRITERIO_DEUDORES_HISTORICO } = require('../src/reportes/deudores-periodo');
const { ROLES_KEY } = require('../src/auth/guards/roles.guard');

const ahora = new Date('2026-10-19T12:00:00Z');
const sample = {
  dni: '12345678', apellido: 'Perez', nombre: 'Ana', telefono: null,
  actividad: 'Yoga', frecuencia: 'UNA_VEZ', clasesTotal: 5, clasesUsadas: 2,
  clasesRestantes: 3, pagado: false, fechaPago: null,
};

test('mes argentino: límites, febrero bisiesto y cambio de año', () => {
  for (const [periodo, inicio, fin] of [
    ['2026-09','2026-09-01T03:00:00.000Z','2026-10-01T03:00:00.000Z'],
    ['2024-02','2024-02-01T03:00:00.000Z','2024-03-01T03:00:00.000Z'],
    ['2025-12','2025-12-01T03:00:00.000Z','2026-01-01T03:00:00.000Z'],
  ]) {
    const rango = rangoDeudoresHistorico(periodo, ahora);
    assert.equal(rango.inicio.toISOString(),inicio);
    assert.equal(rango.fin.toISOString(),fin);
  }
  assert.throws(() => rangoDeudoresHistorico('2026-09',new Date('2026-10-01T02:59:59Z')),/mes anterior/);
  assert.doesNotThrow(() => rangoDeudoresHistorico('2026-09',new Date('2026-10-01T03:00:00Z')));
});

test('rechaza períodos inválidos, actual, futuro y parámetros repetidos', () => {
  for (const periodo of ['', '2026-9', '2026-00', '2026-13', '0000-01', '2026-10', '2027-01', '2026-09;DROP TABLE', ['2026-09','2026-08'], null]) {
    assert.throws(() => rangoDeudoresHistorico(periodo,ahora), (error) => error.getStatus() === 400);
  }
});

test('el reporte actual exige clases realizadas mayores a cero y conserva el filtro de actividad', async () => {
  let consulta;
  const service = new ReportesService({inscripcionActividad:{findMany:async (args) => {
    consulta=args;
    return [{...sample,alumno:sample,actividad:{nombre:sample.actividad}}];
  }}});
  assert.deepEqual(await service.reporteDeudores('yoga'),[sample]);
  assert.deepEqual(consulta.where,{alumno:{activo:true},pagado:false,clasesUsadas:{gt:0},actividadId:'yoga'});
});

test('CSV y Excel tienen las nueve columnas de la UI y los mismos valores', () => {
  const service = new ReportesService({});
  const headers=['DNI','Nombre','Teléfono','Actividad','Frecuencia','Realizadas','Restantes','Pago','Estado'];
  const expected=['12345678','Perez, Ana','—','Yoga','1x semana','2','3','No','AMARILLO'];
  assert.equal(service.generarCsvDeudores([sample]),'\uFEFF'+headers.join(';')+'\n'+expected.join(';'));
  const mainTable=output => output.match(/<Worksheet ss:Name="Deudores"><Table>([\s\S]*?)<\/Table>/)[1];
  const cells=output => Array.from(mainTable(output).matchAll(/<Data ss:Type="String">(.*?)<\/Data>/g),m=>m[1]);
  const actual=service.generarExcelDeudores([sample]);
  assert.deepEqual(cells(actual),[...headers,...expected]);
  assert(!actual.includes('ss:Name="Criterio"'));
  const historic={...sample,periodo:'2024-09',clasesTotal:null,clasesUsadas:null,clasesRestantes:null};
  const csv=service.generarCsvDeudores([historic],'2024-09');
  const excel=service.generarExcelDeudores([historic],'2024-09');
  const historicalRow=['12345678','Perez, Ana','—','Yoga','1x semana','No disponible','No disponible','No','Sin pago registrado'];
  assert.equal(csv,'\uFEFF'+headers.join(';')+'\n'+historicalRow.join(';'));
  assert.deepEqual(cells(excel),[...headers,...historicalRow]);
  assert(!mainTable(excel).includes('Período'));
  assert(excel.includes('ss:Name="Criterio"'));
  assert(excel.includes('2024-09'));
  assert(excel.includes(CRITERIO_DEUDORES_HISTORICO));
  assert(service.generarExcelDeudores([],'2024-09').includes('2024-09'));
  assert.equal(service.generarCsvDeudores([],'2024-09'),'\uFEFF'+headers.join(';'));
  assert(service.generarCsvDeudores([{...historic,apellido:'A;"B"'}],'2024-09').includes('"A;""B"", Ana"'));
  assert(service.generarExcelDeudores([{...historic,apellido:'A<&"B'}],'2024-09').includes('A&lt;&amp;&quot;B'));
});

test('exporta las frecuencias y estados con los textos visibles de la UI', () => {
  const service=new ReportesService({});
  for(const [frecuencia,label] of Object.entries({CLASE_SUELTA:'Clase Suelta',UNA_VEZ:'1x semana',DOS_VECES:'2x semana',TRES_VECES:'3x semana',CUATRO_VECES:'4x semana',CINCO_VECES:'5x semana',LIBRE:'Libre',BECADO:'Becado'})) {
    assert(service.generarCsvDeudores([{...sample,frecuencia}]).includes(';'+label+';'));
  }
  for(const [pagado,clasesRestantes,estado] of [[false,0,'ROJO'],[false,3,'AMARILLO'],[true,3,'VERDE']]) {
    assert(service.generarExcelDeudores([{...sample,pagado,clasesRestantes}]).includes('>'+estado+'</Data>'));
  }
  assert(service.generarExcelDeudores([{...sample,frecuencia:'BECADO'}],'2024-09').includes('Becado: revisar'));
});

test('los endpoints de deudores siguen restringidos a ADMIN', () => {
  for(const method of ['reporteDeudores','periodosDeudores','exportDeudoresCsv','exportDeudoresExcel']) {
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY,ReportesController.prototype[method]),[Rol.ADMIN]);
  }
});

test('controller propaga período y actividad a listado, CSV y Excel', async () => {
  const service=new ReportesService({});
  const calls=[];
  service.reporteDeudores=async (...args) => { calls.push(args); return []; };
  const controller=new ReportesController(service,{});
  assert.deepEqual(await controller.reporteDeudores('yoga','2024-09'),[]);
  for(const [method,ext] of [['exportDeudoresCsv','csv'],['exportDeudoresExcel','xls']]) {
    const headers={}; let body;
    const res={setHeader:(k,v)=>{headers[k]=v;},send:(v)=>{body=v;}};
    await controller[method](res,'yoga','2024-09');
    assert.equal(headers['Content-Disposition'],'attachment; filename="reporte-deudores-2024-09.'+ext+'"');
    assert(body.includes('Realizadas'));
    assert(body.includes('Teléfono'));
    assert(body.includes('Estado'));
  }
  assert.deepEqual(calls,Array(3).fill(['yoga','2024-09']));
});

const databaseUrl=process.env.REPORTES_TEST_DATABASE_URL;
test('PostgreSQL: pagos, anulaciones, adelantos, límites, actividades e inscripciones históricas', {skip: !databaseUrl}, async () => {
  assert(['localhost','127.0.0.1'].includes(new URL(databaseUrl).hostname),'Las pruebas requieren una base local explícita');
  const db=new PrismaClient({datasources:{db:{url:databaseUrl}}});
  const rollback=new Error('rollback de tablas temporales');
  try {
    await assert.rejects(db.$transaction(async (tx) => {
      // Las tablas temporales ocultan las públicas solo en esta conexión.
      // No se insertan ni actualizan alumnos/pagos reales; todo se revierte.
      for(const name of ['Alumno','Actividad','InscripcionActividad','Pago','Ingreso']) {
        await tx.$executeRawUnsafe('CREATE TEMP TABLE "'+name+'" (LIKE public."'+name+'" INCLUDING DEFAULTS) ON COMMIT DROP');
      }
      await tx.$executeRawUnsafe(`INSERT INTO "Actividad" (id,nombre) VALUES ('yoga','Yoga'),('gym','Gimnasio')`);
      const cases=[
        ['sin-pago',true,'2024-08-01','UNA_VEZ','yoga',[]],
        ['pagado',true,'2024-08-01','UNA_VEZ','yoga',[['PAGO','2024-09-10T12:00:00Z']]],
        ['anulado',true,'2024-08-01','UNA_VEZ','yoga',[['PAGO','2024-09-10T12:00:00Z'],['ANULACION','2024-09-11T12:00:00Z']]],
        ['repagado',true,'2024-08-01','UNA_VEZ','yoga',[['ANULACION','2024-09-10T12:00:00Z'],['PAGO','2024-09-11T12:00:00Z']]],
        ['adelanto-octubre',true,'2024-08-01','UNA_VEZ','yoga',[['PAGO','2024-10-01T15:00:00Z']]],
        ['antes-inicio',true,'2024-08-01','UNA_VEZ','yoga',[['PAGO','2024-09-01T02:59:59.999Z']]],
        ['inicio-exacto',true,'2024-08-01','UNA_VEZ','yoga',[['PAGO','2024-09-01T03:00:00Z']]],
        ['fin-exacto',true,'2024-08-01','UNA_VEZ','yoga',[['PAGO','2024-10-01T03:00:00Z']]],
        ['antes-fin',true,'2024-08-01','UNA_VEZ','yoga',[['PAGO','2024-10-01T02:59:59.999Z']]],
        ['inactivo',false,'2024-08-01','UNA_VEZ','yoga',[]],
        ['alta-posterior',true,'2024-10-01T03:00:00Z','UNA_VEZ','yoga',[]],
        ['becado',true,'2024-08-01','BECADO','yoga',[]],
        ['otra-actividad',true,'2024-08-01','UNA_VEZ','gym',[]],
        ['sin-asistencia',true,'2024-08-01','UNA_VEZ','yoga',[]],
        ['solo-rojo',true,'2024-08-01','UNA_VEZ','yoga',[]],
        ['asistencia-otra-actividad',true,'2024-08-01','UNA_VEZ','yoga',[]],
        ['asistencia-otro-mes',true,'2024-08-01','UNA_VEZ','yoga',[]],
        ['asistencia-sin-inscripcion',true,'2024-08-01','UNA_VEZ','yoga',[]],
        ['asistencia-inicio',true,'2024-08-01','UNA_VEZ','yoga',[]],
        ['asistencia-antes-fin',true,'2024-08-01','UNA_VEZ','yoga',[]],
        ['asistencia-fin',true,'2024-08-01','UNA_VEZ','yoga',[]],
        ['empate',true,'2024-08-01','UNA_VEZ','yoga',[['PAGO','2024-09-10T12:00:00Z'],['ANULACION','2024-09-10T12:00:00Z']]],
      ];
      for(const [id,activo,alta,frecuencia,actividad,pagos] of cases) {
        await tx.$executeRaw`INSERT INTO "Alumno" (id,dni,nombre,apellido,activo,"actualizadoEn") VALUES (${id},${id},'Test',${id},${activo},CURRENT_TIMESTAMP)`;
        await tx.$executeRaw`INSERT INTO "InscripcionActividad" (id,"alumnoId","actividadId",frecuencia,"clasesTotal","clasesUsadas",pagado,"creadoEn") VALUES (${id},${id},${actividad},${frecuencia}::"Frecuencia",30,25,true,${new Date(alta).toISOString()}::timestamp)`;
        if (!['sin-asistencia','solo-rojo','asistencia-otra-actividad','asistencia-otro-mes','asistencia-sin-inscripcion','asistencia-inicio','asistencia-antes-fin','asistencia-fin'].includes(id)) {
          await tx.$executeRaw`INSERT INTO "Ingreso" (id,"alumnoId","inscripcionId","fechaHora",estado) VALUES (${'ingreso-'+id},${id},${id},'2024-09-15T12:00:00Z','AMARILLO')`;
        }
        for(const [index,[tipo,fecha]] of pagos.entries()) {
          await tx.$executeRaw`INSERT INTO "Pago" (id,"alumnoId","inscripcionId",tipo,fecha) VALUES (${id+'-'+index},${id},${id},${tipo}::"TipoPago",${new Date(fecha).toISOString()}::timestamp)`;
        }
      }
      // Un pago de otra actividad del mismo alumno no cancela esta deuda.
      await tx.$executeRawUnsafe(`INSERT INTO "InscripcionActividad" (id,"alumnoId","actividadId",frecuencia,"clasesTotal","creadoEn") VALUES ('segunda','sin-pago','gym','UNA_VEZ',30,'2024-08-01');`);
      await tx.$executeRawUnsafe(`INSERT INTO "Pago" (id,"alumnoId","inscripcionId",tipo,fecha) VALUES ('p-segunda','sin-pago','segunda','PAGO','2024-09-15'),('p-sin-inscripcion','sin-pago',NULL,'PAGO','2024-09-15');`);
      await tx.$executeRawUnsafe(`
        INSERT INTO "InscripcionActividad" (id,"alumnoId","actividadId",frecuencia,"clasesTotal","creadoEn")
        VALUES ('actividad-visitada','asistencia-otra-actividad','gym','UNA_VEZ',30,'2024-08-01');
      `);
      await tx.$executeRawUnsafe(`INSERT INTO "Pago" (id,"alumnoId","inscripcionId",tipo,fecha) VALUES ('p-visitada','asistencia-otra-actividad','actividad-visitada','PAGO','2024-09-15')`);
      await tx.$executeRawUnsafe(`INSERT INTO "Ingreso" (id,"alumnoId","inscripcionId","fechaHora",estado) VALUES
        ('duplicado','sin-pago','sin-pago','2024-09-15T12:05:00Z','VERDE'),
        ('rechazado','solo-rojo','solo-rojo','2024-09-15T12:00:00Z','ROJO'),
        ('otra-actividad','asistencia-otra-actividad','actividad-visitada','2024-09-15T12:00:00Z','VERDE'),
        ('mes-anterior','asistencia-otro-mes','asistencia-otro-mes','2024-09-01T02:59:59.999Z','AMARILLO'),
        ('mes-siguiente','asistencia-otro-mes','asistencia-otro-mes','2024-10-01T03:00:00Z','VERDE'),
        ('sin-inscripcion','asistencia-sin-inscripcion',NULL,'2024-09-15T12:00:00Z','VERDE'),
        ('inicio','asistencia-inicio','asistencia-inicio','2024-09-01T03:00:00Z','VERDE'),
        ('antes-fin','asistencia-antes-fin','asistencia-antes-fin','2024-10-01T02:59:59.999Z','AMARILLO'),
        ('fin','asistencia-fin','asistencia-fin','2024-10-01T03:00:00Z','VERDE')`);
      // Un contador actual en cero no borra la asistencia de un mes anterior.
      await tx.$executeRawUnsafe(`UPDATE "InscripcionActividad" SET "clasesUsadas"=0 WHERE id='sin-pago'`);
      const service=new ReportesService(tx);
      const rows=await service.reporteDeudores(undefined,'2024-09');
      assert.deepEqual(rows.map(r=>r.dni).sort(),['sin-pago','anulado','adelanto-octubre','antes-inicio','fin-exacto','becado','otra-actividad','empate','asistencia-inicio','asistencia-antes-fin'].sort());
      assert(rows.every(r=>r.clasesTotal===null&&r.clasesUsadas===null&&r.clasesRestantes===null&&r.pagado===false&&r.periodo==='2024-09'));
      for(const timezone of ['UTC', 'America/Argentina/Buenos_Aires']) {
        await tx.$executeRawUnsafe("SET LOCAL TIME ZONE '"+timezone+"'");
        assert.deepEqual(await service.reporteDeudores(undefined,'2024-09'),rows);
      }
      assert.equal((await service.reporteDeudores('gym','2024-09')).length,1);
      assert.deepEqual(await service.reporteDeudores("yoga' OR 1=1 --",'2024-09'),[]);
      throw rollback;
    },{timeout:20000}),error=>error===rollback);
  } finally { await db.$disconnect(); }
});

test('períodos de deudores incluyen el mes actual y meses sin pagos, sin adelantos futuros', async () => {
  let consulta;
  const service=new ReportesService({inscripcionActividad:{aggregate:async q=>{
    consulta=q;return {_min:{creadoEn:new Date('2025-11-01T02:00:00Z')}};
  }}});
  assert.deepEqual(await service.periodosDeudores(new Date('2026-01-19T12:00:00Z')),['2026-01','2025-12','2025-11','2025-10']);
  assert.deepEqual(consulta,{where:{alumno:{activo:true}},_min:{creadoEn:true}});
  for(const creadoEn of [null,new Date('2026-12-01T12:00:00Z')]){
    const empty=new ReportesService({inscripcionActividad:{aggregate:async()=>({_min:{creadoEn}})}});
    assert.deepEqual(await empty.periodosDeudores(new Date('2026-11-01T02:59:59Z')),['2026-10']);
  }
  const controller=new ReportesController({periodosDeudores:async()=>['2026-10','2026-09']},{});
  assert.deepEqual(await controller.periodosDeudores(),['2026-10','2026-09']);
});

test('el reporte de actividad solo incluye inscripciones con al menos una clase realizada', async () => {
  let consulta;
  const service = new ReportesService({inscripcionActividad:{findMany:async (args) => { consulta=args; return []; }}});
  await service.reporteActividad('yoga');
  assert.deepEqual(consulta.where,{alumno:{activo:true},clasesUsadas:{gt:0},actividadId:'yoga'});
});

test('inscripciones: conClases filtra clases realizadas y el contador de pendientes exige clases', async () => {
  const { InscripcionesService } = require('../src/inscripciones/inscripciones.service');
  let consulta; let sql;
  const service = new InscripcionesService({
    inscripcionActividad:{findMany:async (args) => { consulta=args; return []; }, count:async () => 0},
    $queryRaw:async (strings) => { sql=strings.join('?'); return [{}]; },
  });
  await service.findAll({alumnoActivo:true,pagado:false,conClases:true});
  assert.deepEqual(consulta.where,{alumno:{activo:true},pagado:false,clasesUsadas:{gt:0}});
  await service.findAll({alumnoActivo:true,pagado:false});
  assert.deepEqual(consulta.where,{alumno:{activo:true},pagado:false});
  await service.estadisticas();
  assert.match(sql,/a\.activo AND NOT i\.pagado AND i\."clasesUsadas" > 0\)::int AS "pendientesPago"/);
});
