import { DatabaseSync } from 'node:sqlite';
import type { Entrada } from './tipos.ts';

type Fila = Record<string, unknown>;

export interface Evento {
  id: number; tipo: string; fecha: string; aula_id: number; aula: string; capacidad: number; inscritos: number;
}
export interface AsignacionFila {
  evento_id: number; postulante: string; dni: string | null; programa: string; evaluador: string;
}

export function openDatabase(path = ':memory:', demo = true): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS aulas(id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, capacidad INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS postulantes(id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, programa TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS evaluadores(id INTEGER PRIMARY KEY, nombre TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS eventos(id INTEGER PRIMARY KEY, tipo TEXT NOT NULL, fecha TEXT NOT NULL, aula_id INTEGER NOT NULL REFERENCES aulas(id), UNIQUE(fecha,aula_id));
    CREATE TABLE IF NOT EXISTS asignaciones(id INTEGER PRIMARY KEY, evento_id INTEGER NOT NULL REFERENCES eventos(id), postulante_id INTEGER NOT NULL REFERENCES postulantes(id), evaluador_id INTEGER NOT NULL REFERENCES evaluadores(id), UNIQUE(evento_id,postulante_id));
    CREATE TABLE IF NOT EXISTS actas(id INTEGER PRIMARY KEY, evento_id INTEGER NOT NULL REFERENCES eventos(id), creada TEXT NOT NULL, contenido TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS fuente_traslados(tipo TEXT NOT NULL, documento TEXT NOT NULL, destino INTEGER NOT NULL, PRIMARY KEY(tipo,documento));
    CREATE TABLE IF NOT EXISTS fuente_movimientos(id INTEGER PRIMARY KEY, tipo TEXT NOT NULL, documento TEXT NOT NULL, origen INTEGER NOT NULL, destino INTEGER NOT NULL, fecha TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS fuente_meta(clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
  `);
  if (!(db.prepare('PRAGMA table_info(postulantes)').all() as Fila[]).some(column => column.name === 'dni')) db.exec('ALTER TABLE postulantes ADD COLUMN dni TEXT');
  if (!(db.prepare('PRAGMA table_info(aulas)').all() as Fila[]).some(column => column.name === 'codigo')) db.exec("ALTER TABLE aulas ADD COLUMN codigo TEXT; ALTER TABLE aulas ADD COLUMN activa INTEGER NOT NULL DEFAULT 1; CREATE UNIQUE INDEX aulas_codigo ON aulas(codigo)");
  if (demo && !(db.prepare('SELECT count(*) AS n FROM aulas').get() as { n: number }).n) db.exec(`
    INSERT INTO aulas(id,nombre,capacidad) VALUES (1,'Aula 101',3),(2,'Aula 102',4);
    INSERT INTO postulantes(id,nombre,programa) VALUES (1,'Ana Ejemplo','Maestría en Educación'),(2,'Luis Ejemplo','Maestría en Educación'),(3,'María Ejemplo','Maestría en Gestión');
    INSERT INTO evaluadores VALUES (1,'Evaluador de ejemplo 1'),(2,'Evaluador de ejemplo 2');
  `);
  if (demo) for (const [id, dni] of [[1, '00000001'], [2, '00000002'], [3, '00000003']] as const) db.prepare('UPDATE postulantes SET dni=? WHERE id=? AND dni IS NULL').run(dni, id);
  return db;
}

export function crearEvento(db: DatabaseSync, input: Entrada): number | bigint {
  const { tipo, fecha: texto, aulaId } = input;
  if (typeof tipo !== 'string' || !['Evaluación', 'Entrevista'].includes(tipo) || typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(texto) || !Number.isFinite(new Date(texto).getTime()) || typeof aulaId !== 'number' || !Number.isInteger(aulaId)) throw new Error('Completa el tipo, la fecha y el aula.');
  const fecha = new Date(texto);
  const parts = (texto.match(/\d+/g) ?? []).map(Number);
  if (fecha.getFullYear() !== parts[0] || fecha.getMonth() + 1 !== parts[1] || fecha.getDate() !== parts[2] || fecha.getHours() !== parts[3] || fecha.getMinutes() !== parts[4]) throw new Error('La fecha y hora no son válidas.');
  if (!db.prepare('SELECT 1 FROM aulas WHERE id=? AND activa=1').get(aulaId)) throw new Error('El aula no está disponible.');
  if (db.prepare('SELECT 1 FROM eventos WHERE fecha=? AND aula_id=?').get(texto, aulaId)) throw new Error('El aula ya está ocupada a esa hora.');
  return db.prepare('INSERT INTO eventos(tipo,fecha,aula_id) VALUES (?,?,?)').run(tipo, texto, aulaId).lastInsertRowid;
}

export function asignar(db: DatabaseSync, input: Entrada): void {
  const { eventoId, postulanteId, evaluadorId } = input;
  if (![eventoId, postulanteId, evaluadorId].every(Number.isInteger)) throw new Error('Selecciona una actividad, postulante y evaluador.');
  const evento = db.prepare('SELECT e.fecha,a.capacidad FROM eventos e JOIN aulas a ON a.id=e.aula_id WHERE e.id=?').get(eventoId as number) as { fecha: string; capacidad: number } | undefined;
  if (!evento || !db.prepare('SELECT 1 FROM postulantes WHERE id=?').get(postulanteId as number) || !db.prepare('SELECT 1 FROM evaluadores WHERE id=?').get(evaluadorId as number)) throw new Error('La actividad o la persona seleccionada no existe.');
  if (db.prepare('SELECT 1 FROM asignaciones a JOIN eventos e ON e.id=a.evento_id WHERE a.postulante_id=? AND e.fecha=?').get(postulanteId as number, evento.fecha)) throw new Error('El postulante ya tiene una actividad a esa hora.');
  if ((db.prepare('SELECT count(*) AS n FROM asignaciones WHERE evento_id=?').get(eventoId as number) as { n: number }).n >= evento.capacidad) throw new Error('El aula ha alcanzado su capacidad.');
  db.prepare('INSERT INTO asignaciones(evento_id,postulante_id,evaluador_id) VALUES (?,?,?)').run(eventoId as number, postulanteId as number, evaluadorId as number);
}

export function asignarLote(db: DatabaseSync, input: Entrada): void {
  const ids = input.postulantesIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || new Set(ids).size !== ids.length) throw new Error('Selecciona postulantes diferentes.');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const postulanteId of ids) asignar(db, { eventoId: input.eventoId, postulanteId, evaluadorId: input.evaluadorId });
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function consultarDni(db: DatabaseSync, dni: unknown) {
  if (typeof dni !== 'string' || !/^\d{8}$/.test(dni)) throw new Error('Ingresa un DNI de 8 dígitos.');
  return db.prepare('SELECT e.tipo,e.fecha,a.nombre AS aula FROM postulantes p JOIN asignaciones x ON x.postulante_id=p.id JOIN eventos e ON e.id=x.evento_id JOIN aulas a ON a.id=e.aula_id WHERE p.dni=? ORDER BY e.fecha').all(dni) as { tipo: string; fecha: string; aula: string }[];
}

export function datos(db: DatabaseSync) {
  return {
    aulas: db.prepare('SELECT * FROM aulas WHERE activa=1 ORDER BY nombre').all(),
    postulantes: db.prepare('SELECT * FROM postulantes ORDER BY nombre').all(),
    evaluadores: db.prepare('SELECT * FROM evaluadores ORDER BY nombre').all(),
    eventos: db.prepare('SELECT e.id,e.tipo,e.fecha,e.aula_id,a.nombre AS aula,a.capacidad,(SELECT count(*) FROM asignaciones x WHERE x.evento_id=e.id) AS inscritos FROM eventos e JOIN aulas a ON a.id=e.aula_id ORDER BY e.fecha,e.id').all() as unknown as Evento[],
    asignaciones: db.prepare('SELECT x.evento_id,p.nombre AS postulante,p.dni,p.programa,v.nombre AS evaluador FROM asignaciones x JOIN postulantes p ON p.id=x.postulante_id JOIN evaluadores v ON v.id=x.evaluador_id ORDER BY p.nombre').all() as unknown as AsignacionFila[],
    actas: db.prepare('SELECT id,evento_id,creada FROM actas ORDER BY id DESC').all(),
  };
}

interface Ambiente { codigo: string; nombre: string; usos: string[]; estado: string; capacidad?: number }

export function importarAulas(db: DatabaseSync, snapshot: unknown): number {
  const ambientes = (snapshot as { ambientes?: unknown } | null)?.ambientes;
  if (!Array.isArray(ambientes) || !ambientes.every(r => typeof r?.codigo === 'string' && typeof r.nombre === 'string' && Array.isArray(r.usos) && typeof r.estado === 'string')) throw new Error('El catálogo de aulas recibido no es válido.');
  const rooms = (ambientes as Ambiente[]).filter(r => r.estado === 'disponible' && r.usos.includes('examen_admision') && Number.isInteger(r.capacidad) && r.capacidad! > 0);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('UPDATE aulas SET activa=0 WHERE codigo IS NOT NULL');
    const upsert = db.prepare('INSERT INTO aulas(nombre,capacidad,codigo,activa) VALUES (?,?,?,1) ON CONFLICT(codigo) DO UPDATE SET nombre=excluded.nombre,capacidad=excluded.capacidad,activa=1');
    for (const r of rooms) upsert.run(r.nombre, r.capacidad!, r.codigo);
    db.exec('COMMIT');
    return rooms.length;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function crearActa(db: DatabaseSync, eventoId: unknown, convocatoria: unknown): number | bigint {
  if (typeof eventoId !== 'number' || !Number.isInteger(eventoId)) throw new Error('Selecciona una actividad.');
  if (typeof convocatoria !== 'string' || !convocatoria.trim() || convocatoria.trim().length > 100) throw new Error('Indica la convocatoria.');
  const data = datos(db);
  const evento = data.eventos.find(e => e.id === eventoId);
  const asignaciones = data.asignaciones.filter(a => a.evento_id === eventoId);
  if (!evento || !asignaciones.length) throw new Error('La actividad debe tener al menos un postulante asignado.');
  return db.prepare('INSERT INTO actas(evento_id,creada,contenido) VALUES (?,?,?)').run(eventoId, new Date().toISOString(), JSON.stringify({ evento, asignaciones, convocatoria: convocatoria.trim() })).lastInsertRowid;
}
