/**
 * Genera las actas (HTML + PDF) de todos los grupos a partir de la app en ejecución.
 *
 *   node tools/generar-actas.ts [salida] [--tipo=examen|entrevistas]
 *
 * Variables: BASE_URL (http://127.0.0.1:4350), NAVEGADOR (ruta de Edge/Chrome para los PDF).
 * Los archivos contienen datos personales: se guardan en data/actas/ (excluida de Git).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

interface Grupo { indice: number; tipo: string; hoja: string; aula: string | number; total: number }

const base = process.env.BASE_URL ?? 'http://127.0.0.1:4350';
const raiz = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const filtroTipo = args.find(a => a.startsWith('--tipo='))?.slice(7);
const salida = resolve(args.find(a => !a.startsWith('--')) ?? join(raiz, 'data', 'actas'));
const clave = readFileSync(join(raiz, 'data', 'acceso-local.txt'), 'utf8').trim();
const navegador = [
  process.env.NAVEGADOR,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
].find((p): p is string => !!p && existsSync(p));

const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');

const sesion = await fetch(`${base}/api/sesion`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ clave }) });
if (!sesion.ok) throw new Error(`No se pudo iniciar sesión (${sesion.status}). ¿Está levantada la app en ${base}?`);
const cookie = (sesion.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
const get = (ruta: string) => fetch(base + ruta, { headers: { Cookie: cookie } });

const { grupos } = (await (await get('/api/fuente')).json()) as { grupos: Grupo[] };
mkdirSync(salida, { recursive: true });
if (!navegador) console.warn('No se encontró Edge/Chrome: solo se generará HTML.');

const seleccion = grupos.filter(g => !filtroTipo || g.tipo === filtroTipo);
for (const g of seleccion) {
  const carpeta = join(salida, g.tipo);
  mkdirSync(carpeta, { recursive: true });
  const nombre = `${String(g.indice + 1).padStart(2, '0')}_Aula-${slug(String(g.aula))}_${slug(g.hoja)}`;
  const respuesta = await get(`/api/fichas/${g.indice}`);
  if (!respuesta.ok) throw new Error(`Ficha ${g.indice} falló (${respuesta.status})`);
  const html = join(carpeta, `${nombre}.html`);
  writeFileSync(html, await respuesta.text());
  if (navegador) {
    const pdf = join(carpeta, `${nombre}.pdf`);
    execFileSync(navegador, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, pathToFileURL(html).href], { stdio: 'ignore', timeout: 60_000 });
    rmSync(html);
  }
  console.log(`${g.tipo.padEnd(11)} Aula ${String(g.aula).padEnd(24)} ${String(g.total).padStart(3)} postulantes → ${nombre}`);
}
console.log(`\n${seleccion.length} actas en ${salida}`);
