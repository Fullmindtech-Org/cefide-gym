# Reporte de deudores por mes

Los endpoints GET /reportes/deudores, /reportes/deudores/csv y /reportes/deudores/excel aceptan el parámetro opcional periodo=AAAA-MM y el filtro actividadId. Sin periodo consultan el estado actual, excluyendo inscripciones con clasesUsadas = 0. Los tres continúan protegidos por JWT y rol ADMIN. El mes debe ser anterior al actual en Argentina; período vacío explícito, inválido, actual o futuro devuelve HTTP 400.

La consulta histórica es de solo lectura y parametrizada. Considera el último Pago (por fecha DESC, id DESC) de cada inscripción en [inicio, fin) del mes argentino. El último movimiento PAGO excluye la inscripción; ANULACION o ausencia de movimientos la incluyen. Excluye altas desde el cierre del mes, alumnos actualmente inactivos e inscripciones sin al menos un Ingreso VERDE o AMARILLO de esa misma inscripción en [inicio, fin). Un ingreso ROJO o sin inscripción no prueba asistencia a la actividad. No utiliza los contadores actuales para filtrar meses históricos. BECADO mantiene el criterio del reporte actual. Los tres contadores de clases son null y la respuesta agrega periodo. No hay cambios de esquema, migraciones ni dependencias nuevas.

El historial de pagos puede borrarse desde la plataforma y no contiene período facturado separado de fecha. No existen snapshots mensuales de alumnos, inscripciones o clases. El resultado reconstruye la falta de pago a partir de los movimientos conservados y de las inscripciones activas actuales; no certifica la deuda exigible ni reproduce cambios históricos de activo, actividad o frecuencia. La tabla de la UI, el CSV y la hoja principal del Excel tienen las mismas nueve columnas, en el mismo orden y con los mismos textos: DNI, Nombre, Teléfono, Actividad, Frecuencia, Realizadas, Restantes, Pago y Estado. El período se identifica en el nombre del archivo; Excel agrega una hoja Criterio, incluso sin filas.

El selector de períodos usa GET /reportes/deudores/periodos (ADMIN). Incluye el mes actual y todos los meses desde la primera inscripción actualmente activa, sin depender de que haya pagos en cada mes ni incluir adelantos futuros. La UI preselecciona el mes actual y consulta el reporte vigente sin enviar periodo; solo envía periodo para meses anteriores.

## Validación

Desde la raíz: pnpm --filter backend test:reportes. Para agregar las pruebas PostgreSQL, definir REPORTES_TEST_DATABASE_URL con una conexión local y ejecutar el mismo comando. Las pruebas de integración usan tablas temporales dentro de una transacción que se revierte; no escriben registros reales. Cubren pagos, anulaciones, adelantos, fronteras horarias, altas posteriores, inactivos, becados, varias actividades y filtros parametrizados.

Compilar ambos proyectos: pnpm --filter backend build y pnpm --filter frontend build.

Validación con la copia local del backup del 19/10/2026: nueve pruebas aprobadas, compilaciones de backend y frontend aprobadas y comprobación HTTP/Chrome. El reporte por actividad mantiene sus datos. El reporte actual conserva las 75 inscripciones con Realizadas mayor a cero; septiembre incluye las 17 inscripciones con ingresos permitidos. Se cotejaron las nueve columnas y todas las celdas de las filas históricas entre la UI y el Excel. También se comprobó que el Excel actual no incluya Realizadas en cero. Los límites de pagos y asistencia producen el mismo resultado con la sesión PostgreSQL en UTC y en Argentina.

## Publicación

No requiere migraciones. Publicar backend antes o junto al frontend: la API nueva sigue aceptando los clientes actuales sin periodo. Un frontend nuevo requiere el backend nuevo para consultar meses anteriores. Para revertir, restaurar las versiones anteriores de backend y frontend; esta función no modifica datos.

Revisión visual final: Configuración organiza sus cinco tarjetas en dos columnas independientes en escritorio y una en pantallas menores, aprovechando el ancho disponible. Chrome verificó el selector de deudores con mes actual preseleccionado, selección de septiembre, regreso al mes actual, filtro por actividad y las nueve columnas exportadas. Estas últimas modificaciones no agregan migraciones.
