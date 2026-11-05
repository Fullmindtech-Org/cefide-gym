# Inscripciones, períodos abonados y acceso

Se incorporó la selección explícita de hasta 12 meses y años para cobrar o anular. La fecha de cobertura (`Pago.fecha`) sigue identificando el período abonado; `registradoEn` conserva el instante real de la operación. Solo seleccionar el mes actual modifica `pagado` y `fechaPago` de la inscripción vigente. Los clientes anteriores pueden seguir enviando `mesesAdelantados` para cobrar.

Las anulaciones requieren un motivo de hasta 500 caracteres, validado y recortado en backend. Se almacena en `Pago.nota` y se muestra en el historial. Cobrar y anular son acciones separadas para poder operar sobre otros períodos aunque el mes actual esté pagado. Los reportes históricos y la renovación resuelven el último movimiento de cada período por fecha real, con respaldo en la cobertura para registros legados sin fecha real.

El filtro de asistencia se activa por defecto en Inscripciones y consulta ingresos VERDE/AMARILLO de la actividad dentro del mes argentino. No considera rechazos ni depende de un contador ajustable manualmente. Los accesos del molinete devuelven las clases usadas posteriores al ingreso; los reingresos conservan el contador.

Inscripciones, reportes actuales y exportaciones de deudores usan el mismo cálculo de estado que el molinete, incluyendo gracia consumida y ventana de reingreso. El kiosco muestra la gracia con fondo de advertencia y el aviso para regularizar. Los bloqueos muestran su motivo. La administración tiene navegación horizontal en celulares y tablas desplazables.

La suma de clases sueltas conserva el incremento atómico existente. Se corrigió la edición sin cambio de frecuencia para que preserve las clases agregadas y las consumidas, en lugar de restablecer el cupo configurado. No se agregan importes ni medios de pago.

## Datos y políticas

Se consultó una copia local, sin modificar datos reales. LUCCI JOSÉ tiene modalidad CLASE_SUELTA con cupo de una clase; sus ingresos históricos incluyen gracia y rechazos. El histórico no permite reconstruir el cupo ni la situación de pago en cada rechazo. Bajo la regla vigente, agotar el cupo bloquea aunque exista gracia. No se cambió esa política ni se alteró su inscripción. ARBONA NURIA figura con frecuencia DOS_VECES y cupo de nueve clases en esa copia; tampoco se corrigió por suposición.

Se conserva la gracia configurable (5 en la copia consultada). Quedan sin cambios el bloqueo por deuda anterior, el arrastre de gracia, los excedentes y la habilitación o vencimiento de clases sueltas.

## Ejecución y migraciones

No se requieren migraciones nuevas: se reutilizan `fecha`, `registradoEn` y `nota`. Antes de ejecutar esta versión sobre una base, deben estar aplicadas las migraciones del repositorio, especialmente `20261019000000_pago_registrado_en` y `20261019010000_pago_registrado_en_default`:

```powershell
pnpm --filter backend exec prisma migrate deploy
pnpm --filter backend prisma:generate
```

Para levantar las pruebas locales se respaldó la base en `.local-build/local-runtime/` y se aplicaron ambas migraciones pendientes únicamente a `localhost:5432/cefide`. Se verificó por cantidad y huella SHA-256 que los 689 movimientos originales conservaran todos sus campos previos. Backend y frontend quedaron disponibles en `http://localhost:3000` y `http://127.0.0.1:5173`, respectivamente. No se hicieron commits, push ni despliegues productivos.

## Verificación

Pruebas de pagos, reportes y cambios definidos, con integración PostgreSQL sobre tablas temporales y rollback. La integración nueva usa el esquema temporal también para las operaciones de Prisma, sin escribir en tablas públicas. Ejecutar con `REPORTES_TEST_DATABASE_URL` apuntando explícitamente a una base local:

```powershell
pnpm --filter backend test:pagos
pnpm --filter backend test:reportes
pnpm --filter backend test:cambios-definidos
```

Se verifican cobros retroactivos/futuros, anulaciones con motivo, repagos por fecha real, filtros de asistencia, estados, reingresos, acumulación y edición de clases. Backend y frontend compilados. Se usaron directorios alternativos de salida debido a permisos de archivos de compilaciones anteriores. Chrome verificó filtro activado/desactivado, motivo vacío o con espacios, envío del cobro de un mes seleccionado, historial y contador del kiosco, con API simulada. No se operó el hardware físico.

## Base local actualizada y cobro de deudas anteriores

Se restauró posteriormente el backup recibido con nombre `cefide-postgrescefide-m8bcdc_2026-11-05T02-28-11-639Z.sql.gz`. Su contenido es un archivo PostgreSQL custom comprimido con gzip. Se usó `pg_restore` sin propietarios ni permisos externos, en una única transacción sobre la base local, con un respaldo previo en `.local-build/restore-20261105/`. La base recibida ya tiene las 19 migraciones aplicadas y contiene 22.340 alumnos, 1.415 movimientos de pago y 11.248 ingresos. No se restauró ni modificó producción.

Para evitar confundir períodos, Inscripciones identifica explícitamente el mes del estado de pago. Un ingreso amarillo histórico conserva su estado aunque se pague después; el Log de Ingresos ahora explica esa diferencia y muestra la actividad registrada.

El acceso «Buscar deudas de meses anteriores» abre el reporte del mes anterior. El reporte admite búsqueda por DNI o nombre y cada deuda histórica ofrece «Ver inscripción y cobrar». Ese enlace conserva alumno, actividad y período, desactiva la exigencia de asistencia del mes actual y propone el mes seleccionado en el diálogo de cobro. Si una búsqueda en Inscripciones no devuelve resultados, se ofrece quitar los filtros. El estado visible de la inscripción sigue correspondiendo al mes actual; no se mezclan cobros históricos con el pago vigente.

Se repitieron las 24 pruebas con PostgreSQL restaurado. Se verificó en Chrome el recorrido desde una deuda de octubre sin asistencia en noviembre hasta el diálogo con octubre preseleccionado, además de la búsqueda sin filtros y la actividad del ingreso. Esta verificación usó la API real y bloqueó escrituras: no registró cobros ni modificó asistencias.
