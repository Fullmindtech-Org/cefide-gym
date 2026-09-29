# Renovación mensual

La renovación mensual se administra desde **Historial de Pagos**. El estado
inicial de cualquier instalación es **Manual**: no se ejecuta una renovación
sin una confirmación explícita del operador.

## Modos y programación

- **Manual:** permite una ejecución confirmada, con vista previa del período y
  de las inscripciones activas que se procesarán.
- **Automático:** ejecuta a las 23:59 en zona
  `America/Argentina/Buenos_Aires`, según una de estas reglas:
  - último día calendario del mes;
  - domingo previo al primer lunes calendario del mes.

La programación puede cambiarse aun estando en modo automático. Al activar o
cambiar la programación automática se registra el momento de activación; no se
ejecutan períodos anteriores de forma retrospectiva.

## Integridad y recuperación

Cada período tiene una restricción única en PostgreSQL y un bloqueo
transaccional. Manual, cron, reintentos HTTP y varias instancias del backend no
pueden completar dos veces el mismo período.

La renovación actualiza las inscripciones activas en una transacción. Ante una
falla, PostgreSQL revierte los cambios. El cron revisa cada minuto los períodos
pendientes posteriores a la activación automática, por lo que recupera una
ejecución perdida por una caída o un error a las 23:59.

## Campo retirado: Día de vencimiento

`ConfigSistema.diaVencimiento` permanece temporalmente en la base de datos por
compatibilidad con datos históricos, pero está retirado de la interfaz y del
DTO `PATCH /api/config`. No interviene en accesos, pagos ni en la renovación
mensual. Se evaluará su eliminación física después de validar el nuevo flujo en
producción.
