import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Entrada, Fuente, GrupoResumen, Postulante } from './tipos.ts';

const defaultPath = process.env.FUENTE_PATH ?? new URL('../../../data/fuentes-excel/grupos.json', import.meta.url);
type Origen = string | URL;

export function fuente(db: DatabaseSync, source: Origen = defaultPath): Fuente {
  const raw = readFileSync(source, 'utf8');
  const fingerprint = createHash('sha256').update(raw).digest('hex');
  const saved = db.prepare("SELECT valor FROM fuente_meta WHERE clave='sha256'").get() as { valor: string } | undefined;
  if (saved && saved.valor !== fingerprint && (db.prepare('SELECT count(*) AS n FROM fuente_traslados').get() as { n: number }).n) throw new Error('La fuente Excel cambió; revisa los traslados locales antes de continuar.');
  const data = JSON.parse(raw) as Fuente;
  for (const traslado of db.prepare('SELECT tipo,documento,destino FROM fuente_traslados').all() as { tipo: string; documento: string; destino: number }[]) {
    const origen = data.grupos.find(g => g.tipo === traslado.tipo && g.postulantes.some(p => p.documento === traslado.documento));
    const destino = data.grupos[traslado.destino];
    if (!origen || !destino || destino.tipo !== traslado.tipo) throw new Error('Hay una asignación local incompatible con la fuente.');
    const pos = origen.postulantes.findIndex(p => p.documento === traslado.documento);
    destino.postulantes.push(origen.postulantes.splice(pos, 1)[0]!);
  }
  for (const g of data.grupos) g.postulantes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return data;
}

export function resumen(db: DatabaseSync) {
  const data = fuente(db);
  return { corte: data.corte, grupos: data.grupos.map(({ postulantes, ...g }, indice) => ({ ...g, indice, total: postulantes.length })) };
}

/** Busca al postulante por DNI: sus datos básicos y los grupos (examen/entrevista) donde figura. */
export function buscarPostulante(db: DatabaseSync, dni: unknown, source: Origen = defaultPath): { postulante: Postulante | null; actividades: GrupoResumen[] } {
  if (typeof dni !== 'string' || !/^\d{8}$/.test(dni)) throw new Error('Ingresa un DNI de 8 dígitos.');
  const grupos = fuente(db, source).grupos.filter(g => g.postulantes.some(p => p.documento === dni));
  const postulante = grupos[0]?.postulantes.find(p => p.documento === dni) ?? null;
  return { postulante, actividades: grupos.map(({ postulantes, ...g }) => g) };
}

export const consultarFuente = (db: DatabaseSync, dni: unknown, source: Origen = defaultPath): GrupoResumen[] => buscarPostulante(db, dni, source).actividades;

export function trasladar(db: DatabaseSync, input: Entrada, source: Origen = defaultPath): void {
  const { origen: o, destino: d, documentos } = input;
  if (!Number.isInteger(o) || !Number.isInteger(d) || o === d || !Array.isArray(documentos) || !documentos.length || documentos.length > 500 || new Set(documentos).size !== documentos.length) throw new Error('Selecciona postulantes y otro grupo.');
  const grupos = fuente(db, source).grupos, origen = grupos[o as number], destino = grupos[d as number];
  if (!origen || !destino || origen.tipo !== destino.tipo || origen.programa !== destino.programa) throw new Error('El grupo de destino debe corresponder a la misma actividad y programa.');
  if (!documentos.every((doc): doc is string => typeof doc === 'string' && origen.postulantes.some(p => p.documento === doc))) throw new Error('La lista cambió; vuelve a seleccionar los postulantes.');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare("INSERT INTO fuente_meta(clave,valor) VALUES ('sha256',?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor").run(createHash('sha256').update(readFileSync(source, 'utf8')).digest('hex'));
    const save = db.prepare('INSERT INTO fuente_traslados(tipo,documento,destino) VALUES (?,?,?) ON CONFLICT(tipo,documento) DO UPDATE SET destino=excluded.destino');
    const audit = db.prepare('INSERT INTO fuente_movimientos(tipo,documento,origen,destino,fecha) VALUES (?,?,?,?,?)');
    for (const doc of documentos as string[]) {
      save.run(origen.tipo, doc, d as number);
      audit.run(origen.tipo, doc, o as number, d as number, new Date().toISOString());
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
