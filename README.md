# CEFIDE — Sistema de Control de Acceso y Gestión de Alumnos

Sistema web para el Gimnasio CEFIDE (San Nicolas). Reemplaza software legacy (~2000). Controla acceso fisico mediante molinetes y gestiona alumnos, clases y pagos.

**Dos interfaces:**
- **Panel de administracion** — web, para secretaria y dueño
- **Terminal de acceso** — modo kiosco, para que el socio ingrese su DNI frente al molinete

---

## Stack

| Capa | Tecnologia |
|------|-----------|
| Backend | NestJS + TypeScript |
| Base de datos | PostgreSQL 16 |
| ORM | Prisma |
| Frontend | React + Vite + TypeScript |
| Estilos | Tailwind CSS |
| Componentes UI | shadcn/ui |
| Estado global | Zustand |
| Data fetching | SWR |
| Contenedores | Docker + docker-compose |
| Package manager | pnpm (obligatorio) |
| Deploy | Dokploy |
| DNS / Red | Cloudflare |

## Requisitos

- Node.js >= 20
- pnpm >= 9
- Docker + Docker Compose

---

## Setup local

```bash
# 1. Clonar e instalar dependencias
git clone <repo-url>
cd gym
pnpm install

# 2. Configurar variables de entorno
cp apps/backend/.env.example apps/backend/.env
# Editar .env con valores reales (ver seccion Variables de Entorno)

# 3. Levantar con Docker (el override agrega postgres y puertos locales)
docker compose up -d
# Las migraciones corren automaticamente al iniciar el backend

# 4. Seed inicial (admin + datos de prueba)
cd apps/backend
npx ts-node prisma/seed.ts

# 5. (Opcional) Importar datos del sistema viejo VERSION8
npx ts-node prisma/migracion/parse-version8.ts <ruta-a-CLI.ASC>
npx ts-node prisma/migracion/migrate.ts
```

### Arquitectura Docker

El proyecto usa dos archivos de compose segun la guia Fullmindtech:

- **`docker-compose.yml`** — Solo el backend con Traefik labels. Sin DB, sin ports. Para Dokploy.
- **`docker-compose.override.yml`** — Agrega PostgreSQL local, expone puertos, monta volumenes. Solo para dev local. No va al repo.

### Desarrollo sin Docker

```bash
# Asegurar PostgreSQL corriendo en localhost:5432
# Ajustar DATABASE_URL en .env

# Levantar backend + frontend en paralelo
pnpm dev

# O por separado
pnpm dev:backend   # http://localhost:3000
pnpm dev:frontend  # http://localhost:5173
```

---

## Variables de Entorno

Archivo: `apps/backend/.env`

### Base de datos

| Variable | Descripcion | Ejemplo dev | Produccion |
|----------|-------------|-------------|------------|
| `DATABASE_URL` | Conexion PostgreSQL | `postgresql://cefide:cefide_dev@localhost:5432/cefide` | URL del server de produccion |

### Autenticacion

| Variable | Descripcion | Ejemplo dev | Produccion |
|----------|-------------|-------------|------------|
| `JWT_SECRET` | Clave secreta para firmar tokens JWT | `dev-secret-cambiar-en-produccion` | Generar con `openssl rand -hex 64` |
| `JWT_EXPIRES_IN` | Duracion del access token | `7d` | `7d` |

### Aplicacion

| Variable | Descripcion | Ejemplo dev | Produccion |
|----------|-------------|-------------|------------|
| `PORT` | Puerto del backend | `3000` | `3000` |
| `NODE_ENV` | Entorno de ejecucion | `development` | `production` |
| `CORS_ORIGIN` | URL del frontend (para CORS) | `http://localhost:5173` | `https://cefide.fullmindtech.com` |

### Molinete (servicio local)

| Variable | Descripcion | Ejemplo dev | Produccion |
|----------|-------------|-------------|------------|
| `COM_PORT_MOLINETE_1` | Puerto COM del molinete 1 | `COM1` | Puerto real de la PC del gym |
| `COM_PORT_MOLINETE_2` | Puerto COM del molinete 2 | `COM2` | Puerto real de la PC del gym |
| `COM_SERVICE_URL_1` | URL del servicio local molinete 1 | `http://localhost:3001` | IP local de la PC del gym |
| `COM_SERVICE_URL_2` | URL del servicio local molinete 2 | `http://localhost:3002` | IP local de la PC del gym |
| `COM_PULSE_MS` | Duracion del pulso de apertura (ms) | `500` | `500` (segun spec PCA150) |

### Configuracion por defecto

| Variable | Descripcion | Ejemplo dev | Produccion |
|----------|-------------|-------------|------------|
| `DEFAULT_CLASES_GRACIA` | Clases permitidas sin pago al inicio de mes | `2` | Segun politica del gym |
| `DEFAULT_DIA_VENCIMIENTO` | Dia del mes limite para pagar | `5` | Segun politica del gym |

### Docker Compose (variables internas)

Definidas en `docker-compose.yml`, no en `.env`:

| Variable | Servicio | Valor |
|----------|----------|-------|
| `POSTGRES_USER` | postgres | `cefide` |
| `POSTGRES_PASSWORD` | postgres | `cefide_dev` (cambiar en prod) |
| `POSTGRES_DB` | postgres | `cefide` |
| `API_TARGET` | frontend | `http://backend:3000` |

---

## Estructura del Proyecto

```
gym/
├── apps/
│   ├── backend/                    # NestJS API
│   │   ├── prisma/
│   │   │   ├── schema.prisma       # Modelo de datos
│   │   │   ├── seed.ts             # Datos iniciales
│   │   │   ├── migrations/         # Migraciones Prisma
│   │   │   └── migracion/          # Scripts migracion VERSION8
│   │   │       ├── parse-version8.ts   # Parser binario CLI.ASC → CSV
│   │   │       ├── migrate.ts          # Importador CSV → PostgreSQL
│   │   │       └── data/               # CSVs generados
│   │   └── src/
│   │       ├── auth/               # JWT, guards, login
│   │       ├── alumnos/            # CRUD alumnos
│   │       ├── profesores/         # CRUD profesores
│   │       ├── acceso/             # Validacion acceso (VERDE/AMARILLO/ROJO)
│   │       ├── molinete/           # Driver puerto COM
│   │       ├── ingresos/           # Log de ingresos
│   │       ├── reportes/           # Reportes y CSV export
│   │       ├── config-sistema/     # Clases de gracia, dia vencimiento
│   │       └── prisma/             # Prisma service
│   └── frontend/                   # React/Vite
│       └── src/
│           ├── components/         # UI compartidos (AdminLayout, etc.)
│           ├── pages/
│           │   ├── LoginPage.tsx
│           │   ├── KioscoPage.tsx           # Terminal molinete
│           │   ├── ProfesorDashboard.tsx    # Vista profesor
│           │   └── admin/
│           │       ├── AlumnosPage.tsx      # ABM alumnos
│           │       ├── ProfesoresPage.tsx   # ABM profesores
│           │       ├── ClasesPagosPage.tsx  # Asignar clases, cobrar
│           │       ├── PagosLogPage.tsx     # Historial de pagos
│           │       ├── IngresosLogPage.tsx  # Log de accesos
│           │       ├── ReportePage.tsx      # Reportes por actividad
│           │       ├── MolinetesPage.tsx    # Control molinetes
│           │       └── ConfigPage.tsx       # Config sistema
│           ├── stores/             # Zustand (auth)
│           ├── hooks/              # SWR hooks
│           └── lib/                # API client, utils
├── docker-compose.yml
├── pnpm-workspace.yaml
└── agente.md                       # Prompt de desarrollo
```

---

## API Endpoints

### Publicos (sin auth)

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Login con email + password, retorna JWT |
| `POST` | `/api/auth/refresh` | Renovar access token |
| `POST` | `/api/acceso/validar` | Validar DNI en kiosco (abre molinete si corresponde) |

### Admin (requiere JWT + rol ADMIN)

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| `GET` | `/api/alumnos` | Listar alumnos (paginado, busqueda, filtros) |
| `GET` | `/api/alumnos/:id` | Detalle de alumno |
| `POST` | `/api/alumnos` | Crear alumno |
| `PUT` | `/api/alumnos/:id` | Editar alumno |
| `PATCH` | `/api/alumnos/:id/deactivate` | Baja logica |
| `PATCH` | `/api/alumnos/:id/activate` | Reactivar |
| `DELETE` | `/api/alumnos/:id` | Eliminar alumno y datos relacionados |
| `GET` | `/api/actividades` | Listar actividades (`soloActivas=true` disponible) |
| `POST` | `/api/actividades` | Crear actividad |
| `PATCH` | `/api/actividades/:id` | Editar/activar/desactivar actividad |
| `DELETE` | `/api/actividades/:id` | Eliminar actividad y datos relacionados |
| `GET` | `/api/inscripciones` | Listar inscripciones |
| `POST` | `/api/inscripciones` | Crear inscripción (`409` si alumno/actividad ya existe) |
| `PATCH` | `/api/inscripciones/:id/pagar` | Registrar o anular pago |
| `PATCH` | `/api/inscripciones/:id/clases-sueltas` | Sumar clases |
| `PATCH` | `/api/inscripciones/:id/clases` | Ajustar clases usadas/totales |
| `PATCH` | `/api/inscripciones/:id/frecuencia` | Cambiar frecuencia |
| `DELETE` | `/api/inscripciones/:id` | Eliminar inscripción |
| `GET` | `/api/profesores` | Listar profesores |
| `POST` | `/api/profesores` | Crear profesor |
| `PUT` | `/api/profesores/:id` | Editar profesor |
| `DELETE` | `/api/profesores/:id` | Eliminar profesor |
| `GET` | `/api/ingresos` | Log de ingresos (paginado, filtros) |
| `GET` | `/api/reportes/actividad` | Reporte por actividad |
| `GET` | `/api/reportes/actividad/csv` | Exportar reporte a CSV |
| `GET` | `/api/reportes/pagos` | Historial de pagos global |
| `POST` | `/api/molinete/:num/contingencia` | Registrar apertura manual |

### Profesor (requiere JWT + rol PROFESOR)

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| `GET` | `/api/alumnos` | Solo ve alumnos de su profesor |
| `GET` | `/api/reportes/actividad` | Reporte filtrado a sus alumnos |

---

## Modelo de Datos

### Entidades principales

```
Alumno: dni, nombre, apellido, activo, profesorId, clasesTotal, clasesUsadas, pagado, fechaPago
Profesor: dni, nombre, apellido
Usuario: email, password, rol (ADMIN/PROFESOR), profesorId
Ingreso: alumnoId, fechaHora, estado (VERDE/AMARILLO/ROJO), molinete
Pago: alumnoId, tipo (PAGO/ANULACION), fecha
ConfigSistema: clasesGracia, diaVencimiento
```

### Logica de acceso (estados)

| Estado | Condicion | Accion molinete |
|--------|-----------|-----------------|
| VERDE | Pagado + tiene clases disponibles | Abre |
| AMARILLO | No pago + tiene clases de gracia disponibles | Abre (con aviso) |
| ROJO | Sin clases, o sin gracia, o inactivo | No abre |

### DNIs comodin

`00000000` y `99999999` siempre retornan VERDE sin descontar clases (para dueño/profes).

### Renovacion mensual

Cron job automatico (lunes post dia 30/31): resetea `clasesUsadas = 0` y `pagado = false` para todos los alumnos activos.

### Interruptor de seguridad de la renovacion automatica

El cron solamente puede ejecutar la renovacion si el backend recibe:

```env
RENOVACION_AUTOMATICA_HABILITADA=true
```

Si la variable no existe, esta vacia, tiene un error o vale `false`, la
renovacion automatica queda deshabilitada y no modifica inscripciones. Durante
la conciliacion de pagos en produccion debe configurarse explicitamente:

```env
RENOVACION_AUTOMATICA_HABILITADA=false
```

Despues de modificarla es necesario redesplegar o reiniciar el backend. El log
de inicio informa si la renovacion automatica esta `HABILITADA` o
`DESHABILITADA`.

---

## Credenciales de Desarrollo

| Rol | Email | Password |
|-----|-------|----------|
| Admin | `admin@cefide.com` | `admin123` |
| Profesor | `juan@cefide.com` | `profe123` |

**DNIs de prueba (seed):**

| DNI | Alumno | Estado |
|-----|--------|--------|
| `40111222` | Martin Gonzalez | VERDE |
| `40333444` | Lucia Ramirez | AMARILLO |
| `40555666` | Diego Fernandez | ROJO |
| `40777888` | Sofia Lopez | INACTIVA |

---

## URLs de Acceso

| Entorno | Frontend | Backend API | Prisma Studio |
|---------|----------|-------------|---------------|
| Local | http://localhost:5173 | http://localhost:3000 | http://localhost:5555 |
| Kiosco | http://localhost:5173/kiosco | — | — |
| Produccion | TBD (Dokploy) | TBD | No exponer |

---

## Migracion VERSION8

El sistema anterior (QBASIC + Btrieve, ~2000) se migra en dos pasos:

```bash
cd apps/backend

# 1. Parsear archivo binario CLI.ASC del sistema viejo → CSV
npx ts-node prisma/migracion/parse-version8.ts <ruta-a-CLI.ASC>
# Genera: prisma/migracion/data/alumnos.csv + parse-report.txt

# 2. Importar CSV a PostgreSQL
npx ts-node prisma/migracion/migrate.ts
# Idempotente: se puede correr multiples veces sin duplicar
```

**Resultado:** 2,635 alumnos con DNI importados. ~16,700 registros historicos sin DNI no se importan (necesitan carga manual si aparecen).

---

## Deploy a Produccion (Dokploy)

### Arquitectura de deploy

Segun guia Fullmindtech:
- **Backend** → Dokploy (docker-compose.yml con Traefik)
- **Frontend** → Cloudflare Pages (build estatico de Vite)
- **PostgreSQL** → Servicio separado en Dokploy (no en el compose)
- **Molinete driver** → Proceso local en PC del gym (no en la nube)

### Variables a configurar en Dokploy UI

| Variable | Valor produccion |
|----------|-----------------|
| `DATABASE_URL` | URL del PostgreSQL de Dokploy |
| `JWT_SECRET` | Generar con `openssl rand -hex 64` |
| `JWT_EXPIRES_IN` | `7d` |
| `PORT` | `3000` |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | `https://cefide.fullmindtech.com` |
| `API_DOMAIN` | `api-cefide.fullmindtech.com` |
| `COM_SERVICE_URL_1` | IP local de la PC del gym |
| `COM_SERVICE_URL_2` | IP local de la PC del gym |
| `COM_PULSE_MS` | `500` |
| `DEFAULT_CLASES_GRACIA` | `2` |
| `DEFAULT_DIA_VENCIMIENTO` | `5` |

### Checklist pre-deploy

- [ ] Build Docker funciona: `docker compose build backend`
- [ ] Migraciones corren automaticamente (en el `command` del compose)
- [ ] `JWT_SECRET` generado seguro
- [ ] `CORS_ORIGIN` con dominio real del frontend
- [ ] PostgreSQL creado como servicio separado en Dokploy
- [ ] `DATABASE_URL` apuntando al servicio de Dokploy
- [ ] Dominio configurado en Cloudflare
- [ ] Frontend deployado en Cloudflare Pages
- [ ] Seed ejecutado en servidor
- [ ] Datos VERSION8 importados
- [ ] Passwords de admin y profesor cambiados
- [ ] Servicio COM configurado en PCs del gym
- [ ] Prisma Studio NO expuesto

### Hardware molinete

- Placa: DCM PCA150
- Protocolo: contacto seco, pulso 500ms en pin HAB1/HAB2
- 2 molinetes fisicos, cada uno en PC distinta por puerto COM
- El driver (`COM_SERVICE_URL_*`) corre como proceso local Node.js en cada PC

---

*Proyecto desarrollado con asistencia de IA. Todo codigo revisado antes de mergear.*
