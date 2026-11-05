# Cuotas de tiempo

App de productividad personal basada en temporizadores y cuotas de tiempo acumulables.

Cada actividad tiene su propio calendario semanal, su propia cuota por día y su propio saldo. El excedente de una actividad **nunca** compensa el pendiente de otra. No es un Pomodoro.

Incluye:

- Núcleo de cálculo puro, probado con Vitest.
- Persistencia en MySQL/MariaDB.
- API HTTP con Express.
- Interfaz web en HTML, CSS y JavaScript, sin frameworks.
- Temporizadores independientes por actividad (se guardan en `localStorage`).
- Sesiones manuales, historial, estadísticas, proyección, pausas y calendario editable.
- Edición y división de sesiones, ajuste manual de saldo y archivo de actividades.
- Racha, resumen semanal, mapa de calor y gráfico de evolución del saldo.
- Exportación de sesiones a CSV y copia completa a JSON.
- Tema oscuro/claro, atajos de teclado, deshacer al borrar sesiones y aviso de cuota.

## Requisitos

- Node.js 20 o superior
- npm
- MySQL 5.7+ o MariaDB 10.4+ en marcha
- Una base y un usuario para la app (el script `db:init` puede crear la base)

Probado con Node 26 y MariaDB 10.4.32.

## Arranque rápido

```bash
npm install
cp .env.example .env      # en PowerShell: Copy-Item .env.example .env
npm run db:init
npm start
```

Abre <http://localhost:3000>.

Para desarrollo con recarga automática del servidor:

```bash
npm run dev
```

## Configuración

Copia `.env.example` a `.env` y ajusta los valores:

| Variable | Valor por defecto | Descripción |
| --- | --- | --- |
| `DB_HOST` | `127.0.0.1` | Host de MySQL |
| `DB_PORT` | `3307` | Puerto de MySQL |
| `DB_USER` | `timer` | Usuario de la app |
| `DB_PASSWORD` | `timer` | Contraseña |
| `DB_NAME` | `timer_app` | Nombre de la base |
| `PORT` | `3000` | Puerto del servidor web |

`.env` está en `.gitignore`; nunca se sube al repositorio.

### Crear la base y el usuario

Con un usuario administrador de MySQL:

```sql
CREATE DATABASE IF NOT EXISTS timer_app
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'timer'@'127.0.0.1' IDENTIFIED BY 'timer';
CREATE USER IF NOT EXISTS 'timer'@'localhost' IDENTIFIED BY 'timer';

GRANT ALL PRIVILEGES ON timer_app.* TO 'timer'@'127.0.0.1';
GRANT ALL PRIVILEGES ON timer_app.* TO 'timer'@'localhost';
FLUSH PRIVILEGES;
```

Después:

```bash
npm run db:init
```

`db:init` crea la base si no existe y aplica `server/schema.sql`. Se puede ejecutar varias veces: todas las tablas usan `IF NOT EXISTS`.

### Instancia aislada de MariaDB en este equipo

La instalación de XAMPP en el puerto `3306` tiene las tablas del sistema corruptas (error Aria de checksum). Para no tocar las bases existentes se creó una instancia aislada en el puerto `3307`, con datos en `%LOCALAPPDATA%\timer-app\mysql-data`.

Arrancarla (dejar esa ventana abierta):

```powershell
C:\xampp\mysql\bin\mysqld.exe --defaults-file="$env:LOCALAPPDATA\timer-app\mysql-data\my.ini" --standalone --console
```

Cliente:

```powershell
C:\xampp\mysql\bin\mysql.exe -h 127.0.0.1 -P 3307 -u timer -ptimer timer_app
```

Credenciales de esta instancia:

- App: usuario `timer`, contraseña `timer`.
- Administrador: usuario `root`, contraseña `timerroot`.

## Uso de la app

1. **Crear una actividad** con nombre, fecha de inicio y cuota semanal en minutos. Toda actividad nueva empieza con saldo `0`. Un día con `0` minutos queda libre.
2. **Temporizador:** `Iniciar`, `Pausar` y `Guardar sesión`. Cada actividad tiene su propio temporizador y sigue corriendo aunque recargues la página.
3. **Sesión manual:** añade minutos a una fecha concreta desde "Historial y ajustes".
4. **Más de 6 horas:** la sesión queda como `needs_review` y no cuenta hasta pulsar `Confirmar`.
5. **Calendario:** cada cambio crea una versión con `effective_from`. Solo afecta a esa fecha en adelante; los días cerrados no se tocan.
6. **Pausar / reanudar:** la actividad deja de generar cuotas y el saldo se congela. Al pausar desde hoy, el trabajo registrado hoy deja de contar mientras siga pausada.
7. **Editar datos:** cambia el nombre o la fecha de inicio. Las sesiones anteriores al nuevo inicio dejan de contar.
8. **Ajustar saldo:** fija el saldo actual recalculando el saldo inicial. Sirve para corregir deudas o tiempo previo sin añadir tablas nuevas.
9. **Archivar / reactivar:** una actividad archivada no genera cuotas nuevas y se oculta del temporizador, pero conserva todo su historial. Usa «Mostrar archivadas» para verla.
10. **Historial:** muestra sesiones, racha, resumen semanal, mapa de calor de 12 semanas, gráfico de saldo y los últimos 14 días cerrados.
11. **Editar o dividir sesiones:** cambia fecha, minutos o estado de una sesión; dividir mueve la segunda parte a otra fecha. El saldo se recalcula siempre.
12. **Borrar sesión:** al borrar aparece un aviso con **Deshacer** durante unos segundos.
13. **Exportar:** descarga las sesiones en CSV (compatible con Excel) o una copia completa en JSON.
14. **Eliminar actividad:** borra en cascada su calendario, pausas y sesiones. Esta acción no se puede deshacer.

### Atajos de teclado

| Tecla | Acción |
| --- | --- |
| `1` | Ir al temporizador |
| `2` | Ir a actividades |
| `3` | Ir al historial |
| `S` | Iniciar o pausar el temporizador elegido |
| `N` | Crear una actividad |
| `R` | Actualizar los datos |
| `?` | Mostrar la ayuda de atajos |
| `Esc` | Cerrar la ayuda |

Los atajos se desactivan mientras escribes en un campo. El botón de teclado del
encabezado abre la misma ayuda.

## API

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/health` | Comprueba servidor y base |
| `GET` | `/api/dashboard?today=YYYY-MM-DD` | Panel completo de todas las actividades |
| `POST` | `/api/activities` | Crea una actividad y su calendario inicial |
| `PUT` | `/api/activities/:id` | Cambia nombre y fecha de inicio |
| `DELETE` | `/api/activities/:id` | Elimina la actividad y su historial |
| `PUT` | `/api/activities/:id/schedule` | Añade o reemplaza una versión del calendario |
| `PUT` | `/api/activities/:id/balance` | Ajusta el saldo actual (`balance_min`) |
| `POST` | `/api/activities/:id/pause` | Pausa desde hoy (o desde `today`) |
| `POST` | `/api/activities/:id/resume` | Reanuda desde hoy (o desde `today`) |
| `POST` | `/api/activities/:id/archive` | Archiva sin borrar el historial |
| `POST` | `/api/activities/:id/unarchive` | Reactiva una actividad archivada |
| `POST` | `/api/activities/:id/sessions` | Registra una sesión (`duration_sec` o `minutes`) |
| `PUT` | `/api/sessions/:id` | Edita fecha, duración o estado de una sesión |
| `POST` | `/api/sessions/:id/split` | Divide una sesión y mueve la segunda parte |
| `POST` | `/api/sessions/:id/confirm` | Confirma una sesión pendiente de revisión |
| `DELETE` | `/api/sessions/:id` | Borra una sesión |

Ejemplo para crear una actividad:

```bash
curl -X POST http://localhost:3000/api/activities \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Estudio",
    "start_date": "2026-11-01",
    "initial_balance_min": 0,
    "days": { "0": 45, "2": 45, "4": 60 }
  }'
```

Las cuotas y el saldo inicial se envían en **minutos**; el servidor los guarda en **segundos**.

## Pruebas

```bash
npm test
```

Para ejecutar Vitest en modo vigilancia:

```bash
npm run test:watch
```

Las pruebas del núcleo cubren fechas, calendario, cierre de días, proyección, estadísticas, rachas y pausas múltiples.

## Estructura

```
core/                  lógica del saldo (funciones puras)
  date-utils.js        fechas YYYY-MM-DD, sumar días, día de semana
  schedule.js          calendario por versiones y cuotas
  ledger.js            cierre de días y objetivo de hoy
  projection.js        proyección de cuotas futuras cubiertas
  stats.js             estadísticas del libro diario
  index.js             API pública del núcleo
  tests/               pruebas con Vitest
server/
  index.js             rutas de Express y entrega de la interfaz
  service.js           orquesta el núcleo con la base de datos
  repository.js        todo el SQL
  validation.js        validación de la API
  db.js                pool de mysql2 y transacciones
  errors.js            errores HTTP
  schema.sql           esquema MySQL/MariaDB
  init-db.js           crea la base y aplica el esquema
public/
  index.html           estructura de la app y barra lateral
  styles.css           estilos y diseño adaptable
  app.js               estado, navegación por hash y eventos
  js/
    api.js             envoltorio de fetch
    dates.js           fechas para el mapa de calor
    export.js          exportación CSV y JSON sin librerías
    format.js          formato de fechas, duraciones y estados
    timers.js          temporizadores persistentes en localStorage
    views/
      timer.js         vista Temporizador
      activities.js    vista Actividades
      history.js       vista Historial y estadísticas
.env.example
README.md
```

## Conceptos y fórmulas

- La unidad interna son **segundos enteros**. Solo se redondea a minutos al mostrar.
- El saldo `S` es positivo cuando hay tiempo a favor y negativo cuando hay tiempo pendiente.
- Un día es una fecha local `YYYY-MM-DD`. La zona horaria se resuelve fuera del núcleo.
- Un día está cerrado si su fecha es anterior a `today`. Hoy está abierto.
- El saldo se **deriva del historial**: sesiones terminadas, cuotas cerradas y saldo inicial. Corregir una sesión recalcula todo.
- La interfaz muestra el saldo real si hoy se cerrara ahora: saldo cerrado + trabajo de hoy − cuota de hoy.

Para cada día programado `n`, con cuota `q` y trabajo real `W`:

```
T(n) = max(0, q(n) - S(n-1))        objetivo del día
S(n) = S(n-1) + W(n) - q(n)         saldo al cerrar el día
covered = q - T                     parte de la cuota pagada por excedente
```

El tiempo trabajado en un día **no programado** suma a favor. Los días no programados no generan cuota ni consumen saldo.

### Estados

| Estado | Significado |
| --- | --- |
| `covered` | El objetivo era 0 porque el excedente cubría la cuota |
| `completed` | Se trabajó al menos el objetivo del día |
| `partial` | Día cerrado con algo de trabajo, pero menos que el objetivo |
| `missed` | Día cerrado sin trabajo y con objetivo pendiente |
| `in_progress` | Hoy, con trabajo parcial |
| `pending` | Hoy, sin trabajo y con objetivo pendiente |
| `not_scheduled` | Día sin cuota |
| `paused` | Día de actividad pausada (saldo congelado) |

## Decisiones del MVP

- La semana empieza el lunes: `weekday` va de `0` (lunes) a `6` (domingo).
- Una cuota ausente o `0` significa "día no programado".
- Solo cuentan las sesiones con `state === "finished"` y de la misma actividad.
- El calendario se guarda por versiones con `effective_from`. Para una fecha rige la última versión con `effective_from <= fecha`.
- La nueva versión no puede empezar antes de `max(hoy, start_date)`, para no alterar días ya cerrados.
- El ledger se calcula al consultar; no se guarda una copia. El historial de sesiones y el calendario son la fuente de verdad.
- Una actividad pausada no genera cuotas desde `paused_from` y su saldo queda congelado. Se admiten varios periodos de pausa.
- `projectCoveredQuotas` empieza mañana, salta los días pausados y usa el saldo neto de hoy.
- Las sesiones se asignan a la fecha local indicada. Una sesión que cruza la medianoche pertenece al día en que empezó.
- Las sesiones de más de 6 horas quedan como `needs_review` y no cuentan hasta confirmarse. La regla se aplica en el servidor.
- La deuda se arrastra indefinidamente. El perdón de deuda se aplica con el ajuste manual de saldo.
- Las actividades tienen estado `active`, `paused` o `archived`. Archivar reutiliza el mecanismo de pausa: congela el saldo y conserva el historial.
- La racha solo cuenta días programados con estado `completed` o `covered`. Los días libres y pausados no la rompen.
- El ajuste de saldo modifica `initial_balance_sec` para no añadir tablas ni fórmulas nuevas.
- La exportación CSV usa `;` y BOM para que Excel abra bien los acentos.

## Estado del proyecto

- **Etapa 0:** pruebas con los casos A–G y casos extra. Hecho.
- **Etapa 1:** núcleo de cálculo con funciones puras. Hecho.
- **Etapa 2 (MVP):** MySQL/MariaDB, API HTTP e interfaz web. Hecho.

## Solución de problemas

- **PowerShell bloquea `npm.ps1`:** usa `npm.cmd install`, `npm.cmd test` o `npm.cmd start`.
- **`node` no aparece en la terminal:** reiníciala o ejecuta `fnm use` si instalaste Node con fnm.
- **La página no carga en `localhost:3000`:** faltan procesos. La app necesita MariaDB en el puerto `3307` **y** el servidor Node en el `3000`. Arranca primero MariaDB y después `npm start` (ver «Arranque rápido»). Comprueba con <http://localhost:3000/api/health>.
- **`ECONNREFUSED` al arrancar:** MySQL no está corriendo. Arranca el servicio o la instancia aislada del puerto `3307`.
- **`ER_ACCESS_DENIED_ERROR`:** revisa `DB_USER` y `DB_PASSWORD` en `.env`.
- **`ER_BAD_DB_ERROR`:** ejecuta `npm run db:init`.
- **Puerto 3000 ocupado:** cambia `PORT` en `.env` o detén el proceso que lo usa.
- **La instancia de XAMPP en 3306 falla con error Aria:** no la uses; arranca la instancia aislada del puerto 3307 como se explica arriba.
