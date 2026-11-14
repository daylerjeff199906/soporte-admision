import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDatabase, datos, crearEvento, asignar, asignarLote, importarAulas, crearActa } from './db.ts';
import { renderActa } from './acta.ts';
import { fuente, resumen, buscarPostulante, trasladar } from './fuente.ts';
import { consultarSigae } from './sigae.ts';
import type { Entrada } from './tipos.ts';

if (process.env.NODE_ENV === 'production') throw new Error('Este laboratorio solo admite datos de ejemplo y no puede ejecutarse en producción.');

const port = Number(process.env.PORT ?? 4351);
const host = process.env.HOST ?? '127.0.0.1';
const origins = (process.env.WEB_ORIGIN ?? 'http://127.0.0.1:4350').split(',').map(o => o.trim());
const origenValido = (o: string | undefined): o is string => !!o && origins.includes(o);
const allowedHosts = (process.env.ALLOWED_HOSTS ?? `127.0.0.1:${port}`).split(',').map(h => h.trim());
const directory = process.env.DATA_DIR ?? fileURLToPath(new URL('../../../data', import.meta.url));
mkdirSync(directory, { recursive: true });
const db = openDatabase(join(directory, 'programacion.sqlite'), false);
const accessFile = join(directory, 'acceso-local.txt');
if (!existsSync(accessFile)) writeFileSync(accessFile, randomBytes(24).toString('hex'), { mode: 0o600 });
const access = readFileSync(accessFile, 'utf8').trim();

const same = (a: string, b: string): boolean => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const attempts = new Map<string, { n: number; reset: number }>();
function limit(key: string, max: number): boolean {
  const now = Date.now(), entry = attempts.get(key);
  if (!entry || entry.reset <= now) { attempts.set(key, { n: 1, reset: now + 60_000 }); return false; }
  return ++entry.n > max;
}

const rutasPost = ['/api/eventos', '/api/asignaciones', '/api/asignaciones-lote', '/api/trasladar', '/api/consulta', '/api/sincronizar-aulas', '/api/actas'];
const cspHtml = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";

async function leerCuerpo(req: IncomingMessage, max: number): Promise<string | null> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > max) return null;
  }
  return body;
}

async function manejar(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!allowedHosts.includes(req.headers.host ?? '')) { res.writeHead(403).end(); return; }
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  if (req.headers.origin && !origenValido(req.headers.origin)) { res.writeHead(403).end(); return; }
  if (origenValido(req.headers.origin)) {
    const origin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  const json = (code: number, value: unknown): void => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(value));
  };
  try {
    if (req.method === 'POST' && url.pathname === '/api/sesion') {
      if (!origenValido(req.headers.origin) || !req.headers['content-type']?.startsWith('application/json')) return json(403, { error: 'Origen no permitido.' });
      if (limit('sesion', 8)) return json(429, { error: 'Demasiados intentos. Espera un minuto.' });
      const body = await leerCuerpo(req, 1024);
      if (body === null) return json(413, { error: 'Solicitud demasiado grande.' });
      let input: unknown;
      try { input = JSON.parse(body); } catch { return json(400, { error: 'Datos inválidos.' }); }
      const clave = (input as { clave?: unknown } | null)?.clave;
      if (typeof clave !== 'string' || !same(clave, access)) return json(401, { error: 'Clave incorrecta.' });
      res.setHeader('Set-Cookie', `admision_local=${access}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
      return json(200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/salud') return json(200, { ok: true });
    const authorized = (req.headers.cookie ?? '').split(';').some(c => {
      const [k, v] = c.trim().split('=');
      return k === 'admision_local' && typeof v === 'string' && same(v, access);
    });
    if (!authorized && url.pathname !== '/api/consulta') return json(401, { error: 'Acceso local requerido.' });
    if (req.method === 'GET' && url.pathname === '/api/fuente') return json(200, resumen(db));
    const groupMatch = /^\/api\/grupos\/(\d+)$/.exec(url.pathname);
    if (req.method === 'GET' && groupMatch) {
      const grupo = fuente(db).grupos[Number(groupMatch[1])];
      return grupo ? json(200, grupo) : json(404, { error: 'Grupo no encontrado.' });
    }
    const fichaMatch = /^\/api\/fichas\/(\d+)$/.exec(url.pathname);
    if (req.method === 'GET' && fichaMatch) {
      const id = Number(fichaMatch[1]);
      const grupo = fuente(db).grupos[id];
      if (!grupo) return json(404, { error: 'Grupo no encontrado.' });
      const date = (grupo.fecha ?? grupo.instrucciones ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
      const evento = { tipo: grupo.tipo === 'examen' ? 'Evaluación' : 'Entrevista', fecha: date ? `${date[3]}-${date[2]}-${date[1]}T00:00` : '0000-00-00T00:00', aula: grupo.aula, capacidad: grupo.postulantes.length };
      const asignaciones = grupo.postulantes.map(p => ({ postulante: p.nombre, dni: p.documento }));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': cspHtml });
      res.end(renderActa({ id: id + 1, contenido: JSON.stringify({ evento, asignaciones, convocatoria: '2026-II' }) }));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/datos') return json(200, datos(db));
    const match = /^\/api\/actas\/(\d+)$/.exec(url.pathname);
    if (req.method === 'GET' && match) {
      const acta = db.prepare('SELECT * FROM actas WHERE id=?').get(Number(match[1])) as { id: number; contenido: string } | undefined;
      if (!acta) return json(404, { error: 'Acta no encontrada.' });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': cspHtml });
      res.end(renderActa(acta));
      return;
    }
    if (req.method === 'POST' && rutasPost.includes(url.pathname)) {
      if (!origenValido(req.headers.origin) || !req.headers['content-type']?.startsWith('application/json')) return json(403, { error: 'Origen no permitido.' });
      const body = await leerCuerpo(req, 8192);
      if (body === null) return json(413, { error: 'Solicitud demasiado grande.' });
      let parsed: unknown;
      try { parsed = JSON.parse(body); } catch { return json(400, { error: 'Datos inválidos.' }); }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json(400, { error: 'Datos inválidos.' });
      const input = parsed as Entrada;
      if (url.pathname === '/api/consulta') {
        if (limit('consulta', 10)) return json(429, { error: 'Demasiadas consultas. Espera un minuto.' });
        const encontrado = buscarPostulante(db, input.dni);
        if (!encontrado.postulante) return json(200, { ...encontrado, sigae: null });
        // SIGAE aporta el nombre oficial, la foto y si la inscripción sigue activa; si no responde se usa el Excel.
        const sigae = await consultarSigae(encontrado.postulante.documento);
        return json(200, {
          postulante: { ...encontrado.postulante, nombre: sigae?.nombre || encontrado.postulante.nombre, foto: sigae?.foto ?? undefined },
          actividades: encontrado.actividades,
          sigae: sigae ? { activo: sigae.activo } : null,
        });
      }
      if (url.pathname === '/api/trasladar') { trasladar(db, input); return json(200, { ok: true }); }
      if (url.pathname === '/api/sincronizar-aulas') {
        if (!process.env.INTRANET_URL || !process.env.INTRANET_SERVICE_KEY) return json(503, { error: 'Catálogo institucional no configurado. Se muestran aulas de ejemplo.' });
        let response: Response;
        try {
          response = await fetch(new URL('/interno/v1/ambientes', process.env.INTRANET_URL), { headers: { 'X-Service-Name': 'admision', 'X-Service-Key': process.env.INTRANET_SERVICE_KEY }, redirect: 'error', signal: AbortSignal.timeout(5000) });
        } catch { return json(503, { error: 'No se pudo consultar el catálogo institucional.' }); }
        if (!response.ok) return json(503, { error: 'El catálogo institucional rechazó la consulta o no está disponible.' });
        return json(200, { importadas: importarAulas(db, await response.json()) });
      }
      const id = url.pathname === '/api/eventos' ? crearEvento(db, input)
        : url.pathname === '/api/asignaciones' ? asignar(db, input)
        : url.pathname === '/api/asignaciones-lote' ? asignarLote(db, input)
        : crearActa(db, input.eventoId, input.convocatoria);
      return json(201, { id: id === undefined ? null : Number(id) });
    }
    json(404, { error: 'Ruta no encontrada.' });
  } catch (error) { json(400, { error: error instanceof Error ? error.message : 'No se pudo completar la operación.' }); }
}

createServer((req, res) => { void manejar(req, res); }).listen(port, host, () => console.log(`API de prueba: http://${host}:${port}`));
