# CEFIDE — Manual de Uso

Guía práctica para el día a día del gimnasio. Explica cómo funciona el sistema y cómo usarlo, sin tecnicismos.

---

## ¿Qué es este sistema?

Es el programa que controla **quién entra al gimnasio** y administra a los alumnos, las actividades y los pagos. Reemplaza al sistema viejo.

Tiene dos partes:

1. **El Panel** — la pantalla de administración. Acá el encargado da de alta alumnos, cobra cuotas, ve listados, etc. Se entra con usuario y contraseña.
2. **El Kiosco** — la pantalla en la entrada del gimnasio. El alumno pone su DNI y el sistema decide si lo deja pasar, abriendo el molinete.

---

## Cómo se entra al Panel

1. Abrir el navegador en la dirección del sistema.
2. Ingresar el **email** y la **contraseña** del encargado.
3. Listo: aparece el menú de administración a la izquierda.

> Si te olvidás la contraseña, la cambia el administrador del sistema.

---

## Las ideas básicas (para entender todo lo demás)

Antes de usarlo, conviene entender 4 conceptos:

- **Alumno**: la persona. Tiene nombre, apellido y DNI. Puede estar **activo** (puede usar el gimnasio) o **inactivo** (se le bloquea la entrada, por ejemplo si se dio de baja).

- **Actividad**: lo que se hace en el gimnasio. Por ejemplo *Musculación*, *Spinning*, *Funcional*.

- **Inscripción**: cuando anotás a un alumno en una actividad. Acá se define la **frecuencia** (cuántas veces por semana viene) y eso determina **cuántas clases** tiene en el mes.

- **Cuota / Pago**: cada inscripción se cobra. Marcás "pagado" cuando el alumno abona.

La regla de oro: **un alumno entra al gimnasio si está activo, tiene clases disponibles y está al día con la cuota** (con un margen de gracia, explicado más abajo).

---

## Cuántas clases da cada frecuencia

Cuando inscribís a un alumno, elegís con qué frecuencia viene. Eso le asigna una cantidad de clases para el mes:

| Frecuencia | Clases en el mes |
|---|---|
| Clase Suelta | 1 |
| 1 vez por semana | 5 |
| 2 veces por semana | 9 |
| 3 veces por semana | 13 |
| 4 veces por semana | 17 |
| 5 veces por semana | 21 |
| Libre | 30 |
| Becado | 30 |

La opción **Becado** asigna inicialmente 30 clases y deja visible esa condición en la inscripción, los listados y los reportes. Esa cantidad puede cambiarse desde **Configuración → Clases por frecuencia → Becado**.

*(Estos números se pueden cambiar desde la pantalla de Configuración.)*

Cada vez que el alumno entra, se le descuenta **una clase**. Cuando se le acaban, no puede entrar hasta el próximo mes (o hasta que le sumes clases).

---

## El día a día: tareas más comunes

### 1. Dar de alta un alumno nuevo
Menú **Alumnos** → botón de agregar → cargás nombre, apellido y DNI. Queda **activo** automáticamente.

En **Inscripción inicial (opcional)** podés elegir una actividad y frecuencia para dejarlo inscripto en el mismo paso. También podés dejar **Sin inscripción inicial** y anotarlo más adelante desde Inscripciones.

Mientras se guarda, el botón muestra primero **Creando alumno...** y luego **Creando inscripción...**. No cierres ni repitas la operación hasta ver el resultado.

Si aparece “Alumno creado correctamente, pero no se pudo confirmar/completar la inscripción”, el alumno **sí quedó registrado**. Revisá la sección Inscripciones antes de volver a inscribirlo.

### 2. Crear una actividad
Menú **Actividades** → agregar → nombre de la actividad. (Esto se hace una sola vez por actividad.)

### 3. Inscribir un alumno en una actividad
Menú **Inscripciones** → agregar → elegís el alumno, la actividad y la frecuencia. El sistema le carga las clases del mes según la frecuencia.

> Un alumno puede estar en varias actividades (ej: Musculación y Spinning), cada una con su propia cuota y sus propias clases.

### 4. Cobrar la cuota
Menú **Inscripciones** → buscás al alumno → marcás **Pagado**.
- Al marcar, queda registrado el pago con la fecha.
- Si te equivocaste, lo podés desmarcar (queda registrado como anulación).

### 5. Renovar el mes
Al empezar un mes nuevo, usás el botón de **Renovación mensual**. Esto pone a **todos** en cero: reinicia las clases usadas y marca a todos como "no pagado", listos para volver a cobrar.

> Importante: esto es **manual**. Hay que acordarse de hacerlo a principio de mes.

### 6. Dar de baja o reactivar un alumno
Menú **Alumnos** → botón de activar/desactivar.
- **Inactivo**: se le bloquea la entrada al gimnasio, aunque haya pagado.
- **Activo**: vuelve a poder entrar.

Se usa para bajas temporales, deudores que querés frenar, etc.

### 7. Ajustes sueltos
En **Inscripciones** también podés:
- **Sumar clases sueltas** a un alumno (ej: le vendés 2 clases extra).
- **Cambiar la frecuencia** (ej: pasa de 2 a 3 veces por semana).

---

## Cómo funciona la entrada (el molinete)

Cuando un alumno llega y pone su **DNI** en el Kiosco de la entrada, pasa esto:

1. El sistema busca al alumno y muestra sus actividades.
2. El alumno elige a qué actividad viene.
3. El sistema decide con un **semáforo**:

### 🟢 Verde — Pasa
El alumno está activo, tiene clases y pagó. Se abre el molinete y se le descuenta una clase.

### 🟡 Amarillo — Pasa, pero con aviso
El alumno todavía **no pagó** este mes, pero tiene **clases de gracia** disponibles. Se lo deja entrar igual, mostrando el mensaje "regularizar pago". Se descuenta la clase y se consume una de gracia.

> **Clases de gracia**: son las primeras entradas del mes que el sistema perdona si el alumno todavía no abonó. Por defecto son **2**. Sirve para que no le cierres la puerta al que viene los primeros días de mes antes de pagar. Cuando se le acaban las de gracia y sigue sin pagar, pasa a rojo.

### 🔴 Rojo — No pasa
El molinete no abre. Puede ser porque:
- El alumno está **inactivo** (dado de baja).
- Se le **acabaron las clases** del mes.
- **No pagó** y ya usó todas sus clases de gracia.

En todos los casos queda registrado el intento de entrada.

---

## El molinete físico

Cuando el semáforo da verde o amarillo, el sistema le manda la orden de **abrir** al molinete y este gira para dejar pasar a la persona.

- Si por algún motivo el molinete no responde (por ejemplo, se desconectó), **el sistema igual registra la entrada** y no se traba. Solo queda anotado el error.
- En el menú **Molinetes** hay un botón de **contingencia** para abrir el molinete a mano cuando haga falta.

---

## Listados y reportes

- **Inscripciones**: ver quién está anotado en qué, cuántas clases le quedan y si pagó.
- **Historial de Pagos**: todos los pagos y anulaciones.
- **Ingresos / Accesos**: registro de cada vez que alguien pasó (o intentó pasar) por el molinete, con el resultado del semáforo.
- **Reportes**: listado por actividad de los alumnos activos, con sus clases y estado de pago. Se puede **exportar a Excel** (CSV).

---

## Profesores

El sistema permite cargar **profesores** y darles un usuario propio. El profesor entra con su cuenta y ve sus listados, pero **no puede cobrar ni administrar** alumnos. Eso queda solo para el encargado/administrador.

---

## Configuración

En el menú **Configuración** se ajustan los parámetros del sistema:
- Cantidad de **clases de gracia**.
- Cuántas **clases** corresponden a cada frecuencia.

Se cambian una vez y quedan para todo el gimnasio.

---

## Situaciones comunes (preguntas frecuentes)

**Aparece una franja amarilla indicando que no hay comunicación con el servidor.**
El panel sigue abierto, pero la información visible puede estar desactualizada. Esperá a que vuelva la conexión antes de hacer cambios. Las tablas conservan la última información recibida.

**Una operación dice que no pudo confirmar el resultado.**
Puede haberse guardado justo antes del corte. Revisá el alumno, inscripción, pago o clases antes de volver a presionar el botón; el sistema no repite escrituras automáticamente.

**El panel muestra “Ocurrió un error inesperado”.**
Es un error del frontend, no necesariamente del backend. Usá **Recargar**. Si continúa, contactá al administrador.

**El alumno pagó pero no lo deja entrar.**
Verificá que esté **activo** y que **le queden clases**. Un alumno inactivo no entra aunque haya pagado.

**Todos los alumnos figuran "activo".**
Es normal: "activo" es el estado de alta/baja, no el de pago. El que no pagó igual aparece activo; el sistema lo frena en el molinete por la cuota, no por el estado.

**Empezó el mes y siguen apareciendo las clases del mes pasado.**
Falta hacer la **Renovación mensual**. Hay que correrla a principio de mes.

**Quiero venderle clases extra a un alumno.**
En Inscripciones, usá **sumar clases sueltas**.

**El molinete no abre.**
Usá el botón de **contingencia** en el menú Molinetes. Avisá al técnico si pasa seguido.

**El panel marca un molinete como "caído" pero funciona igual.**
Es un indicador de estado que puede mostrar rojo aunque el molinete abra bien. No afecta la entrada de los alumnos.
</content>
