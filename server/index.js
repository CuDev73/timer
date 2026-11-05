// Servidor HTTP: rutas de la API y entrega de la interfaz web.

import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { HttpError } from './errors.js';
import * as repository from './repository.js';
import * as service from './service.js';
import { parseId } from './validation.js';

const app = express();
const publicDir = fileURLToPath(new URL('../public', import.meta.url));

app.use(express.json({ limit: '100kb' }));
app.use(express.static(publicDir));

/** Envuelve un handler para no repetir try/catch en cada ruta. */
function handle(handler) {
  return async (request, response, next) => {
    try {
      await handler(request, response);
    } catch (error) {
      next(error);
    }
  };
}

// --- Salud ---------------------------------------------------------------

app.get(
  '/api/health',
  handle(async (request, response) => {
    await repository.ping();
    response.json({ ok: true, today: service.localToday() });
  }),
);

// --- Panel ---------------------------------------------------------------

app.get(
  '/api/dashboard',
  handle(async (request, response) => {
    const today = service.resolveToday(request.query.today);
    response.json(await service.getDashboard(today));
  }),
);

// --- Actividades ---------------------------------------------------------

app.post(
  '/api/activities',
  handle(async (request, response) => {
    const result = await service.createActivity(request.body);
    response.status(201).json(result);
  }),
);

app.put(
  '/api/activities/:id',
  handle(async (request, response) => {
    const id = parseId(request.params.id, 'Id de actividad');
    response.json(await service.updateActivity(id, request.body));
  }),
);

app.put(
  '/api/activities/:id/balance',
  handle(async (request, response) => {
    const id = parseId(request.params.id, 'Id de actividad');
    const today = service.resolveToday(request.body?.today);
    response.json(await service.adjustBalance(id, request.body, today));
  }),
);

app.post(
  '/api/activities/:id/archive',
  handle(async (request, response) => {
    const id = parseId(request.params.id, 'Id de actividad');
    const today = service.resolveToday(request.body?.today);
    response.json(await service.archiveActivity(id, today));
  }),
);

app.post(
  '/api/activities/:id/unarchive',
  handle(async (request, response) => {
    const id = parseId(request.params.id, 'Id de actividad');
    const today = service.resolveToday(request.body?.today);
    response.json(await service.unarchiveActivity(id, today));
  }),
);

app.delete(
  '/api/activities/:id',
  handle(async (request, response) => {
    const id = parseId(request.params.id, 'Id de actividad');
    response.json(await service.deleteActivity(id));
  }),
);

// --- Calendario ----------------------------------------------------------

app.put(
  '/api/activities/:id/schedule',
  handle(async (request, response) => {
    const id = parseId(request.params.id, 'Id de actividad');
    const today = service.resolveToday(request.body?.today);
    response.json(await service.addScheduleVersion(id, request.body, today));
  }),
);

// --- Pausa y reanudación -------------------------------------------------

app.post(
  '/api/activities/:id/pause',
  handle(async (request, response) => {
    const id = parseId(request.params.id, 'Id de actividad');
    const today = service.resolveToday(request.body?.today);
    response.json(await service.pauseActivity(id, today));
  }),
);

app.post(
  '/api/activities/:id/resume',
  handle(async (request, response) => {
    const id = parseId(request.params.id, 'Id de actividad');
    const today = service.resolveToday(request.body?.today);
    response.json(await service.resumeActivity(id, today));
  }),
);

// --- Sesiones ------------------------------------------------------------

app.post(
  '/api/activities/:id/sessions',
  handle(async (request, response) => {
    const id = parseId(request.params.id, 'Id de actividad');
    const today = service.resolveToday(request.body?.today);
    const result = await service.addSession(id, request.body, today);
    response.status(201).json(result);
  }),
);

app.put(
  '/api/sessions/:id',
  handle(async (request, response) => {
    const id = parseId(request.params.id, 'Id de sesión');
    const today = service.resolveToday(request.body?.today);
    response.json(await service.updateSession(id, request.body, today));
  }),
);

app.post(
  '/api/sessions/:id/split',
  handle(async (request, response) => {
    const id = parseId(request.params.id, 'Id de sesión');
    const today = service.resolveToday(request.body?.today);
    response.json(await service.splitSession(id, request.body, today));
  }),
);

app.post(
  '/api/sessions/:id/confirm',
  handle(async (request, response) => {
    const id = parseId(request.params.id, 'Id de sesión');
    response.json(await service.confirmSession(id));
  }),
);

app.delete(
  '/api/sessions/:id',
  handle(async (request, response) => {
    const id = parseId(request.params.id, 'Id de sesión');
    response.json(await service.deleteSession(id));
  }),
);

// Cualquier otra ruta de /api responde 404 en JSON.
app.use('/api', (request, response, next) => {
  next(new HttpError(404, 'Ruta de la API no encontrada.'));
});

// --- Manejo de errores ---------------------------------------------------

app.use((error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  // JSON mal formado enviado por el cliente.
  if (error?.type === 'entity.parse.failed') {
    response.status(400).json({ error: 'El cuerpo de la petición no es JSON válido.' });
    return;
  }

  const status = error instanceof HttpError ? error.status : 500;

  if (status === 500) {
    console.error('Error inesperado:', error);
  }

  response.status(status).json({
    error: status === 500 ? 'Error interno del servidor.' : error.message,
  });
});

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`Servidor listo en http://localhost:${port}`);
});
