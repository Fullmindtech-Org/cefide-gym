# CEFIDE — Documentación del Sistema

Sistema web de control de acceso y gestión para el Gimnasio CEFIDE. Reemplaza un software obsoleto (~2000). Controla el acceso físico por molinetes y administra alumnos, actividades, inscripciones y pagos. **No** incluye contabilidad ni facturación.

---

## 1. Stack y arquitectura

| Capa | Tecnología |
|---|---|
| Backend | NestJS 11 + Prisma 6 + PostgreSQL 16 |
| Frontend | React 19 + Vite 6 + Tailwind + shadcn/ui + Zustand + SWR |
| Auth | JWT (access + refresh), bcrypt |
| Driver molinete | Proceso Node.js local separado (puerto COM, pulso 500 ms) |
| Monorepo | pnpm workspaces |
| Deploy | Docker + Dokploy + Cloudflare/Traefik |

**Apps** (`apps/`):
- `backend` — API REST (`/api`)
- `frontend` — Panel admin + Terminal kiosco
- `molinete-driver` — Servicio local que abre el molinete físico (no se corre en dev normal; requiere puertos COM)

**Dos interfaces de usuario:**
- **Panel admin** (web) — gestión completa, login con email/password
- **Terminal kiosco** — pantalla en el gym, alumno ingresa DNI

---

## 2. Modelo de datos

```
Alumno ──< InscripcionActividad >── Actividad
  │              │
  │              ├──< Ingreso   (log de pasos por molinete)
  │              └──< Pago      (log de pagos/anulaciones)
  │
  └──< Ingreso, Pago

Profesor ──1:1── Usuario (rol PROFESOR)
ConfigSistema (fila única "global")
```

### Entidades

**Alumno** — `dni` (único), `nombre`, `apellido`, `activo` (bool, default `true`).
`activo` es un flag **manual** de alta/baja (tipo baja lógica). No se calcula de pagos.

**Actividad** — `nombre` (único), `activo`. Ej: Musculación, Spinning.

**InscripcionActividad** — vínculo alumno↔actividad. Único por `(alumnoId, actividadId)`.
- `frecuencia` — `CLASE_SUELTA` | `UNA_VEZ` | `DOS_VECES` | `TRES_VECES` | `CUATRO_VECES` | `CINCO_VECES` | `LIBRE` | `BECADO`
- `clasesTotal` — cupo del período (según frecuencia + config)
- `clasesUsadas` — consumidas (default 0)
- `pagado` — bool (default `false`)
- `fechaPago` — fecha del último pago

**ConfigSistema** (fila única `id="global"`):
| Campo | Default | Uso |
|---|---|---|
| `clasesGracia` | 2 | clases que se permiten sin pagar al inicio del período |
| `diaVencimiento` | 5 | día límite para regularizar — **definido pero NO usado en acceso** |
| `clasesUnaVez` | 5 | cupo frecuencia UNA_VEZ |
| `clasesDosVeces` | 9 | cupo DOS_VECES |
| `clasesTresVeces` | 13 | cupo TRES_VECES |
| `clasesCuatroVeces` | 17 | cupo CUATRO_VECES |
| `clasesCincoVeces` | 21 | cupo CINCO_VECES |
| `clasesSuelta` | 1 | cupo CLASE_SUELTA |
| `clasesLibre` | 30 | cupo LIBRE |
| `clasesBecado` | 30 | cupo BECADO |

**Ingreso** — registro de cada paso por molinete: `estado` (VERDE/AMARILLO/ROJO), `molinete` (1/2), `fechaHora`, `inscripcionId`.

**Pago** — log: `tipo` (PAGO/ANULACION), `fecha`, `nota`, `inscripcionId`.

**Profesor / Usuario** — Usuario tiene `rol` (ADMIN/PROFESOR). Un Profesor puede tener una cuenta Usuario asociada (1:1).

---

## 3. Frecuencia → cupo de clases

Al inscribir (o cambiar frecuencia), `clasesTotal` se setea desde la config:

| Frecuencia | Clases/período (default) |
|---|---|
| `CLASE_SUELTA` | 1 |
| `UNA_VEZ` | 5 |
| `DOS_VECES` | 9 |
| `TRES_VECES` | 13 |
| `CUATRO_VECES` | 17 |
| `CINCO_VECES` | 21 |
| `LIBRE` | 30 |
| `BECADO` | 30 |

`BECADO` identifica explícitamente la condición del alumno en la inscripción. Su cupo inicial es de 30 clases por período, puede editarse mediante `clasesBecado` en Configuración y se muestra como **Becado** en la interfaz y los reportes.

---

## 4. Flujo ADMIN (alta y cobro)

1. **Alumnos** (`/admin/alumnos`) → crear alumno. Nace `activo=true`.
   - El alta permite elegir opcionalmente una actividad y frecuencia. El frontend crea primero el alumno y, usando el `id` confirmado por `POST /alumnos`, crea la inscripción mediante `POST /inscripciones`.
   - Sin actividad seleccionada se conserva el alta simple. La inscripción inicial no aparece al editar un alumno existente.
   - Si el alumno se crea pero falla la inscripción, el alumno no se elimina: el operador recibe un resultado parcial y debe verificar la pantalla de Inscripciones antes de reintentar.
2. **Actividades** (`/admin/actividades`) → crear actividad.
3. **Inscripciones** (`/admin/clases-pagos`) → inscribir alumno a actividad con una frecuencia.
   - Genera `clasesTotal` según frecuencia, `clasesUsadas=0`, `pagado=false`.
   - No puede repetirse la misma (alumno, actividad) — devuelve conflicto.
4. **Cobrar** → marcar `pagado` en la inscripción (`PATCH /inscripciones/:id/pagar`).
   - Setea `fechaPago=now` y crea `Pago(PAGO)`.
   - Desmarcar → `fechaPago=null` + `Pago(ANULACION)`.
5. **Ajustes de inscripción:**
   - **Clases sueltas** → `clasesTotal += N` (`PATCH /:id/clases-sueltas`)
   - **Cambiar frecuencia** → recalcula `clasesTotal` desde Configuración y permite guardar `clasesUsadas` en la misma operación (`PATCH /:id/frecuencia`)
6. **Renovación mensual** → `POST /inscripciones/renovacion-mensual` resetea **todas** las inscripciones: `clasesUsadas=0`, `pagado=false`, `fechaPago=null`.
   - Se puede disparar manualmente desde el panel admin.
   - **Cron automático** (`RenovacionCron`): corre todos los días a las 3 AM. Si `diaDelMes >= diaVencimiento` y aún no se ejecutó este mes (idempotente via `ultimaRenovacion`), ejecuta la renovación automáticamente.

**Baja/alta de alumno:** `PATCH /alumnos/:id/deactivate` y `/activate` togglean `activo`. Un alumno inactivo queda bloqueado en el molinete aunque tenga pagos.

---

## 5. Flujo ACCESO (kiosco + molinete)

El alumno tipea su DNI en el **Kiosco** (`/kiosco`). Endpoints **públicos** (sin JWT):

### Paso 1 — Consultar (`POST /api/acceso/consultar`)
Devuelve el alumno y sus inscripciones con `clasesRestantes` (= `clasesTotal − clasesUsadas`) y `pagado`. No registra nada ni abre molinete. El alumno elige la actividad.

### Paso 2 — Validar (`POST /api/acceso/validar`)
Calcula el **semáforo**, registra el `Ingreso` y, si no es ROJO, abre el molinete.

Orden de evaluación en `validarAcceso`:

| # | Condición | Estado | Resultado |
|---|---|---|---|
| 1 | DNI comodín (`00000000` / `99999999`) | 🟢 VERDE | acceso libre |
| 2 | `alumno.activo == false` | 🔴 ROJO | bloqueado (inactivo) |
| 3 | no eligió inscripción | 🔴 ROJO | "seleccionar actividad" |
| 4 | inscripción inexistente | 🔴 ROJO | "inscripción no válida" |
| 5 | `clasesRestantes <= 0` | 🔴 ROJO | "sin clases disponibles" |
| 6 | `pagado == true` | 🟢 VERDE | permitido |
| 7 | `pagado == false` y gracia disponible | 🟡 AMARILLO | pasa, avisa "regularizar" |
| 8 | `pagado == false` y sin gracia | 🔴 ROJO | "regularizar pago" |

**Cálculo de gracia (paso 7):**
`clasesGraciaRestantes = clasesGracia(config, def 2) − (ingresos AMARILLO de ESTA inscripción en el mes actual)`.
Mientras sea > 0, deja pasar sin pago. El conteo es por **mes calendario** (desde el día 1), no por fecha de vencimiento.

### Paso 3 — Registro y apertura
`registrarIngreso`:
- Crea `Ingreso(estado, molinete)`.
- Si `estado != ROJO` y hay inscripción → `clasesUsadas += 1` (descuenta clase), dentro de una transacción.

Apertura del molinete: el **frontend** hace `GET http://127.0.0.1:8080/proxy/<nombre>/abrir` directamente al GymProxy local instalado en la PC del kiosco. El backend en la nube no alcanza los molinetes; el proxy reenvía la orden al hardware. El endpoint `/molinete/:num/contingencia` del backend solo deja registro en la base de datos.

**Contingencia:** `POST /molinete/:num/contingencia` abre manualmente desde el admin. `GET /molinete/:num/status` chequea si el driver responde.

### Semáforo — resumen
- 🟢 **VERDE** — pagado + con clases → entra, descuenta clase
- 🟡 **AMARILLO** — sin pagar pero quedan clases de gracia del mes → entra, avisa, descuenta clase **y** consume gracia
- 🔴 **ROJO** — inactivo / sin clases / sin gracia → no entra, no abre molinete

---

## 6. Roles y seguridad

- **JWT**: `POST /auth/login` → `accessToken` (7 d) + `refreshToken`. `POST /auth/refresh`, `GET /auth/me`.
- **Guards**: `JwtAuthGuard` + `RolesGuard` con decorador `@Roles(...)`.
- **ADMIN** — acceso total (crear/editar/borrar, cobros, config, profesores, molinete, reportes CSV).
- **PROFESOR** — lectura de inscripciones/alumnos/actividades/reportes; **no** cobra ni administra. Tiene dashboard propio (`/profesor`).
- **Acceso público** (sin token): solo `/acceso/consultar` y `/acceso/validar` (el kiosco) y `/health`.
- **Admin seed**: al bootstrap, si `ADMIN_EMAIL` + `ADMIN_PASSWORD` están definidos, crea/actualiza el admin (idempotente). Si faltan, omite y avisa por log.

---

## 7. Reportes

- `GET /reportes/actividad?actividadId=` — inscripciones de alumnos **activos**, con clases y estado de pago. (ADMIN + PROFESOR)
- `GET /reportes/actividad/csv` — mismo dato exportado a CSV (separador `;`, BOM para Excel). (solo ADMIN)
- `GET /reportes/pagos` — historial de pagos. (solo ADMIN)
- `GET /ingresos` — log de accesos por molinete.

UI: `/admin/reportes`, `/admin/pagos` (historial), `/admin/ingresos` (log de accesos).

---

## 8. Mapa de endpoints (API `/api`)

| Método | Ruta | Rol | Acción |
|---|---|---|---|
| POST | `/auth/login` | público | login |
| POST | `/auth/refresh` | público | renovar token |
| GET | `/auth/me` | autenticado | perfil |
| GET | `/alumnos` | ADMIN/PROF | listar (filtros: search, activo, page) |
| GET | `/alumnos/:id` | ADMIN/PROF | detalle |
| POST | `/alumnos` | ADMIN | crear |
| PUT | `/alumnos/:id` | ADMIN | editar |
| PATCH | `/alumnos/:id/activate`·`/deactivate` | ADMIN | alta/baja |
| DELETE | `/alumnos/:id` | ADMIN | borrar alumno y relaciones |
| GET | `/actividades`·`/:id` | ADMIN/PROF | listar/detalle |
| POST·PATCH | `/actividades`·`/:id` | ADMIN | crear/editar |
| DELETE | `/actividades/:id` | ADMIN | borrar actividad y relaciones |
| GET | `/inscripciones` | ADMIN/PROF | listar (search, actividadId, page) |
| GET | `/inscripciones/alumno/:alumnoId` | ADMIN/PROF | por alumno |
| POST | `/inscripciones` | ADMIN | inscribir |
| PATCH | `/inscripciones/:id/pagar` | ADMIN | marcar/desmarcar pago |
| PATCH | `/inscripciones/:id/clases-sueltas` | ADMIN | sumar clases |
| PATCH | `/inscripciones/:id/clases` | ADMIN | ajustar usadas/total |
| PATCH | `/inscripciones/:id/frecuencia` | ADMIN | cambiar frecuencia; acepta `clasesUsadas` opcional |
| DELETE | `/inscripciones/:id` | ADMIN | borrar |
| POST | `/inscripciones/renovacion-mensual` | ADMIN | reset mensual |
| POST | `/acceso/consultar` | público | kiosco paso 1 |
| POST | `/acceso/validar` | público | kiosco paso 2 |
| POST | `/molinete/:num/contingencia` | ADMIN | apertura manual (log) |
| GET | `/ingresos` | ADMIN/PROF | log accesos |
| GET | `/reportes/actividad` | ADMIN/PROF | reporte |
| GET | `/reportes/actividad/csv` | ADMIN | CSV |
| GET | `/reportes/pagos` | ADMIN | pagos |
| DELETE | `/reportes/pagos/:id` | ADMIN | borrar sólo el registro del log |
| GET·PATCH | `/config` | ADMIN | leer/editar config |
| GET·POST·PUT·DELETE | `/profesores`… | ADMIN | CRUD profesores |
| GET | `/health` | público | healthcheck |

---

## 9. Comunicación frontend-backend y errores

El cliente común está en `apps/frontend/src/lib/api.ts`. Todas las solicitudes tienen un timeout predeterminado de **15 segundos** y no existen reintentos automáticos para escrituras.

| Tipo | Detección | Comportamiento del frontend |
|---|---|---|
| Funcional | HTTP `400`–`499` | muestra el mensaje seguro enviado por la API; duplicados usan `409` |
| Servidor | HTTP `500`–`599` | informa un problema del servidor, sin exponer detalles internos |
| Red | `ApiError.kind = network` | informa que no pudo conectarse ni confirmar la operación |
| Timeout | `ApiError.kind = timeout` | en escrituras advierte que el servidor podría haber completado la operación |
| Respuesta inválida | `ApiError.kind = invalid-response` | no confirma éxito y solicita verificar antes de repetir |

Códigos HTTP esperados por los flujos documentados:

| Código | Significado |
|---|---|
| `200` | lectura, edición o eliminación confirmada |
| `201` | alumno, inscripción u otro recurso creado |
| `400` | payload o validación inválida |
| `401` | sesión ausente, vencida o token inválido |
| `403` | usuario autenticado sin permiso suficiente |
| `404` | recurso inexistente |
| `409` | conflicto funcional, por ejemplo inscripción duplicada |
| `500`–`599` | error interno o indisponibilidad del servidor |

Reglas de operación:

- Los botones de escritura se deshabilitan durante el envío y los loaders finalizan mediante `finally`.
- Una escritura sólo muestra éxito después de recibir confirmación HTTP válida.
- Un microcorte posterior a la persistencia deja un resultado incierto; no se repite automáticamente el `POST`, `PATCH` o `DELETE`.
- SWR conserva la última lectura válida (`keepPreviousData`) y revalida al recuperar foco o conexión.
- El banner superior amarillo indica que el backend no está disponible y que los datos pueden estar desactualizados.
- El refresh de sesión sólo cierra la sesión ante `401` o `403`. Red, timeout, respuesta inválida o `5xx` conservan la sesión local para permitir recuperación.
- `AppErrorBoundary` evita una pantalla blanca ante errores React de render y ofrece recargar la aplicación.

### Idempotencia y resultados inciertos

- `POST /inscripciones` está protegido por `@@unique([alumnoId, actividadId])`; los duplicados devuelven `409`.
- Activar/desactivar, editar valores absolutos y guardar configuración son naturalmente repetibles, aunque no se reintentan automáticamente.
- Sumar clases, registrar/anular pagos y validar accesos pueden duplicar efectos si el operador repite una solicitud cuyo resultado no pudo confirmarse.
- Una eliminación que sí se completó puede responder `404` al repetirse.

### Alta con inscripción inicial

Secuencia utilizada por el modal de Nuevo alumno:

```text
POST /api/alumnos { dni, nombre, apellido, ...contactoOpcional }
  -> respuesta Alumno con id
POST /api/inscripciones { alumnoId, actividadId, frecuencia }
```

El selector consume `GET /api/actividades?soloActivas=true`. Las frecuencias y cantidades de clases son las mismas del flujo normal de Inscripciones. No se genera ningún ID en el navegador y no existe rollback compensatorio si falla la segunda operación.

---

## 10. Pantallas del frontend

**Admin** (`/admin/*`):
- `alumnos` — listado/alta/baja (default tras login)
- `actividades` — CRUD actividades
- `clases-pagos` — **Inscripciones**: inscribir + cobrar + ajustar clases/frecuencia
- `pagos` — historial de pagos
- `ingresos` — log de accesos por molinete
- `reportes` — reporte por actividad + export CSV
- `molinetes` — estado y contingencia
- `profesores` — CRUD profesores
- `config` — parámetros del sistema

**Otras:**
- `/login` — acceso al panel
- `/kiosco` — terminal de ingreso por DNI
- `/profesor` — dashboard del profesor

---

## 11. Cómo levantar (dev, Docker)

```powershell
docker compose up --build -d      # postgres + backend + frontend
docker compose logs -f backend    # logs
docker compose down               # apagar
docker compose up -d              # prender (sin rebuild)
```

| Servicio | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API | http://localhost:3000/api |
| Postgres | localhost:5432 (`cefide`/`cefide_dev`) |

**Login dev:** credenciales definidas en `ADMIN_EMAIL` / `ADMIN_PASSWORD` del `.env` (ver `.env.example`).

Variables clave (`.env` raíz + `apps/backend/.env`): `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CORS_ORIGIN`, `DEFAULT_CLASES_GRACIA`, `DEFAULT_DIA_VENCIMIENTO`.

> Las vars `COM_PORT_MOLINETE_*`, `COM_SERVICE_URL_*` y `COM_PULSE_MS` pertenecen al **go-driver** (configuradas en su `config.json`), no al backend.

> Nota: el `environment:` del `docker-compose.yml` interpola `${ADMIN_EMAIL}` etc. desde el `.env` de la **raíz**. Si solo lo ponés en `apps/backend/.env`, queda pisado por string vacío. Definir en la raíz.

El `molinete-driver` no corre en dev (necesita puertos COM físicos). El backend tolera que no responda (timeout + log de error).

---

## 12. Observaciones / huecos detectados

- **`diaVencimiento`** está en config pero **no se usa**: la gracia se mide contando ingresos AMARILLO del mes, no por fecha límite.
- **Renovación mensual**: hay cron automático (`EVERY_DAY_AT_3AM`) que ejecuta cuando `diaDelMes >= diaVencimiento`, idempotente por mes. El botón manual sigue disponible en el panel admin.
- **`activo` ≠ estado de pago**: el listado de alumnos muestra el flag manual; el estado de cuota vive en las inscripciones.
- **DNIs comodín** (`00000000`, `99999999`) dan acceso libre permanente — útil para staff/pruebas, revisar en producción.
</content>
</invoke>
