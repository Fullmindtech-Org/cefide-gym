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
- `frecuencia` — `UNA_VEZ` | `DOS_VECES` | `TRES_VECES` | `LIBRE`
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
| `clasesLibre` | 30 | cupo LIBRE |

**Ingreso** — registro de cada paso por molinete: `estado` (VERDE/AMARILLO/ROJO), `molinete` (1/2), `fechaHora`, `inscripcionId`.

**Pago** — log: `tipo` (PAGO/ANULACION), `fecha`, `nota`, `inscripcionId`.

**Profesor / Usuario** — Usuario tiene `rol` (ADMIN/PROFESOR). Un Profesor puede tener una cuenta Usuario asociada (1:1).

---

## 3. Frecuencia → cupo de clases

Al inscribir (o cambiar frecuencia), `clasesTotal` se setea desde la config:

| Frecuencia | Clases/período (default) |
|---|---|
| `UNA_VEZ` | 5 |
| `DOS_VECES` | 9 |
| `TRES_VECES` | 13 |
| `LIBRE` | 30 |

---

## 4. Flujo ADMIN (alta y cobro)

1. **Alumnos** (`/admin/alumnos`) → crear alumno. Nace `activo=true`.
2. **Actividades** (`/admin/actividades`) → crear actividad.
3. **Inscripciones** (`/admin/clases-pagos`) → inscribir alumno a actividad con una frecuencia.
   - Genera `clasesTotal` según frecuencia, `clasesUsadas=0`, `pagado=false`.
   - No puede repetirse la misma (alumno, actividad) — devuelve conflicto.
4. **Cobrar** → marcar `pagado` en la inscripción (`PATCH /inscripciones/:id/pagar`).
   - Setea `fechaPago=now` y crea `Pago(PAGO)`.
   - Desmarcar → `fechaPago=null` + `Pago(ANULACION)`.
5. **Ajustes de inscripción:**
   - **Clases sueltas** → `clasesTotal += N` (`PATCH /:id/clases-sueltas`)
   - **Cambiar frecuencia** → recalcula `clasesTotal` (`PATCH /:id/frecuencia`)
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
| GET | `/actividades`·`/:id` | ADMIN/PROF | listar/detalle |
| POST·PATCH | `/actividades`·`/:id` | ADMIN | crear/editar |
| GET | `/inscripciones` | ADMIN/PROF | listar (search, actividadId, page) |
| GET | `/inscripciones/alumno/:alumnoId` | ADMIN/PROF | por alumno |
| POST | `/inscripciones` | ADMIN | inscribir |
| PATCH | `/inscripciones/:id/pagar` | ADMIN | marcar/desmarcar pago |
| PATCH | `/inscripciones/:id/clases-sueltas` | ADMIN | sumar clases |
| PATCH | `/inscripciones/:id/frecuencia` | ADMIN | cambiar frecuencia |
| DELETE | `/inscripciones/:id` | ADMIN | borrar |
| POST | `/inscripciones/renovacion-mensual` | ADMIN | reset mensual |
| POST | `/acceso/consultar` | público | kiosco paso 1 |
| POST | `/acceso/validar` | público | kiosco paso 2 |
| POST | `/molinete/:num/contingencia` | ADMIN | apertura manual (log) |
| GET | `/ingresos` | ADMIN/PROF | log accesos |
| GET | `/reportes/actividad` | ADMIN/PROF | reporte |
| GET | `/reportes/actividad/csv` | ADMIN | CSV |
| GET | `/reportes/pagos` | ADMIN | pagos |
| GET·PATCH | `/config` | ADMIN | leer/editar config |
| GET·POST·PUT·DELETE | `/profesores`… | ADMIN | CRUD profesores |
| GET | `/health` | público | healthcheck |

---

## 9. Pantallas del frontend

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

## 10. Cómo levantar (dev, Docker)

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

## 11. Observaciones / huecos detectados

- **`diaVencimiento`** está en config pero **no se usa**: la gracia se mide contando ingresos AMARILLO del mes, no por fecha límite.
- **Renovación mensual**: hay cron automático (`EVERY_DAY_AT_3AM`) que ejecuta cuando `diaDelMes >= diaVencimiento`, idempotente por mes. El botón manual sigue disponible en el panel admin.
- **`activo` ≠ estado de pago**: el listado de alumnos muestra el flag manual; el estado de cuota vive en las inscripciones.
- **DNIs comodín** (`00000000`, `99999999`) dan acceso libre permanente — útil para staff/pruebas, revisar en producción.
</content>
</invoke>
