# Historial de pagos: fecha real y controles de renovación

## Comportamiento

El historial abre con el mes calendario actual en America/Argentina/Buenos_Aires. No elige el máximo de la lista porque los adelantos pueden tener cobertura futura. El mes actual se mantiene entre las opciones aunque no tenga registros. La ejecución y configuración de renovaciones se movieron a Configuración, conservando los mismos endpoints ADMIN, las confirmaciones, la vista previa, la auditoría y el bloqueo por período. El historial no consulta ni ejecuta renovaciones.

Pago.fecha conserva su significado de cobertura: pagos adelantados, renovaciones y reportes de deudores siguen consultándolo. Pago.registradoEn guarda el instante UTC del cobro real. Cada cuota de un mismo adelanto comparte ese instante; las anulaciones también lo guardan. El historial agrega fechaImpacto sin sustituir el campo fecha usado por clientes anteriores. La columna Fecha y su ordenamiento usan el instante real; Mes abonado y el selector mensual usan la cobertura. Desde/Hasta filtran el instante real, incluyendo todo el día argentino, y comparten el filtro con las estadísticas.

## Migraciones

1. 20261019000000_pago_registrado_en agrega una columna nullable y un índice; completa los movimientos ordinarios desde fecha. Para adelantos legados, identifica la primera cuota por alumno, inscripción y cantidad de meses; exige coincidencia exacta con la fecha de cobertura generada en Argentina, incluyendo ajustes de fin de mes y milisegundos. Solo recupera el instante cuando todos los candidatos coinciden. Los casos ambiguos o sin primera cuota quedan nulos y se muestran como No disponible.
2. 20261019010000_pago_registrado_en_default agrega un default UTC para nuevas escrituras, incluso desde clientes del backend anterior durante un despliegue gradual. No rellena retrospectivamente los casos desconocidos.

Las migraciones conservan las columnas y valores originales de pagos e inscripciones. No eliminan registros ni renuevan inscripciones.

## Publicación

Respaldar la base productiva. Generar Prisma y compilar el backend con el esquema actualizado. Aplicar prisma migrate deploy antes de iniciar el backend nuevo; Docker Compose ya ejecuta ese paso en su command. Publicar backend y luego frontend. Ambas migraciones son aditivas: el backend anterior puede seguir operando; si se revierte el código, mantener la columna y el índice evita perder el dato nuevo. No usar migrate reset ni db push en producción.

Esta tarea aplicó las migraciones únicamente a la copia local, luego de generar .local-backups/cefide-before-pago-registrado-en-20261019.dump. El despliegue productivo queda pendiente.

## Validación

pnpm --filter backend test:pagos y pnpm --filter backend test:reportes: 15 pruebas aprobadas, incluidas pruebas PostgreSQL con tablas temporales y rollback. Cubren instante único por cobro, cobertura futura, anulaciones, fin de mes, cambios de año, legado inequívoco, ambigüedad, otras inscripciones y defaults independientes de la zona horaria. Backend y frontend compilan.

En el backup local se conservaron los 1.156 movimientos originales y se recuperaron los 42 registros adelantados: 14 coberturas de octubre, 14 de noviembre y 14 de diciembre, con fecha real de octubre. Los reportes de actividad y deudores conservan sus resultados (75 inscripciones actuales con asistencia y 17 de septiembre).

Chrome confirmó el mes predeterminado, la fecha real de las 14 coberturas de diciembre, el rango por fecha de cobro y los controles en Configuración. Se abrió la confirmación y se canceló sin escribir en la API; el servidor de verificación bloqueó escrituras. Captura local en .local-reports/pagos-config-validacion/historial-pagos-fecha-real.png.
