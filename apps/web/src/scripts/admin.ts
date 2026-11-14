import { ArrowRight } from 'lucide';
import { icono } from './dom.ts';
interface GrupoResumen {
  indice: number;
  tipo: 'examen' | 'entrevistas';
  programa: string;
  aula: string | number;
  sede?: string;
  fecha?: string;
  grupo?: string;
  total: number;
}
interface Postulante { documento: string; nombre: string }
interface GrupoDetalle extends Omit<GrupoResumen, 'indice' | 'total'> { postulantes: Postulante[] }
interface AulaInstitucional { nombre: string; capacidad: number; codigo?: string | null }

const options: RequestInit = { credentials: 'include' };
let groups: GrupoResumen[] = [];
let currentGroup = -1;

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Falta ${selector}`);
  return node;
};

function h<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function alertMessage(text: string, error = false) {
  const box = $('#alert');
  box.textContent = text;
  box.className = `mb-6 rounded-xs border px-4 py-3 text-sm ${error ? 'border-[#a11]/30 bg-[#a11]/5 text-[#a11]' : 'border-hairline bg-white text-ink'}`;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(path, options);
  if (!response.ok) throw new Error(response.status === 401 ? 'Tu sesión venció; inicia sesión de nuevo.' : 'No se pudieron cargar los datos.');
  return response.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { ...options, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? 'No se pudo completar la operación.');
  return data;
}

const nombreTipo = (tipo: string) => (tipo === 'examen' ? 'Examen' : 'Entrevista');
const detalleGrupo = (g: Pick<GrupoResumen, 'fecha' | 'sede' | 'aula' | 'grupo'>) => `${g.fecha ?? g.sede ?? ''} · Aula ${g.aula}${g.grupo ? ' · ' + g.grupo : ''}`;

function paint() {
  const term = $<HTMLInputElement>('#search').value.toLocaleLowerCase('es');
  const type = $<HTMLSelectElement>('#type').value;
  const selected = groups.filter(g => (!type || g.tipo === type) && `${g.programa} ${g.aula} ${g.grupo ?? ''} ${g.sede ?? ''}`.toLocaleLowerCase('es').includes(term));
  $('#result-count').textContent = `${selected.length} grupos`;
  const box = $('#groups');
  box.replaceChildren();
  if (!selected.length) {
    box.className = 'p-6 text-sm text-iron';
    box.textContent = 'No encontramos grupos con esos filtros.';
    return;
  }
  box.className = 'divide-y divide-hairline';
  for (const g of selected) {
    const button = h('button', 'flex w-full flex-wrap items-center justify-between gap-3 px-6 py-4 text-left transition-colors hover:bg-cream');
    button.type = 'button';
    const info = h('span', 'min-w-0');
    info.append(h('span', 'block font-normal', g.programa), h('span', 'mt-1 block text-sm text-iron', `${nombreTipo(g.tipo)} · ${g.fecha ?? '15/11/2026'} · ${g.sede ?? 'Iquitos'} · Aula ${g.aula}${g.grupo ? ' · ' + g.grupo : ''}`));
    const cola = h('span', 'label inline-flex items-center gap-2', `${g.total} postulantes`);
    cola.append(icono(ArrowRight));
    button.append(info, cola);
    button.addEventListener('click', () => { void showGroup(g.indice); });
    box.append(button);
  }
}

async function showGroup(index: number) {
  try {
    const g = await get<GrupoDetalle>(`/api/grupos/${index}`);
    currentGroup = index;
    $('#detail-title').textContent = g.programa;
    $('#detail-meta').textContent = `${nombreTipo(g.tipo)} · Aula ${g.aula} · ${g.postulantes.length} postulantes`;
    const tbody = $('#people');
    tbody.replaceChildren();
    $<HTMLInputElement>('#select-all').checked = false;
    g.postulantes.forEach((p, i) => {
      const tr = document.createElement('tr');
      const td = h('td', 'px-6 py-3');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.name = 'documentos';
      checkbox.value = p.documento;
      checkbox.setAttribute('aria-label', `Seleccionar a ${p.nombre}`);
      td.append(checkbox);
      tr.append(td);
      for (const value of [String(i + 1), p.nombre, p.documento]) tr.append(h('td', 'px-6 py-3', value));
      tbody.append(tr);
    });
    const dest = $<HTMLSelectElement>('#destination');
    dest.replaceChildren(new Option('Selecciona otro grupo', ''));
    for (const c of groups.filter(x => x.indice !== index && x.tipo === g.tipo && x.programa === g.programa)) dest.add(new Option(detalleGrupo(c), String(c.indice)));
    $<HTMLButtonElement>('#transfer-button').disabled = dest.options.length === 1;
    $<HTMLAnchorElement>('#acta').href = `/api/fichas/${index}`;
    $('#detail').classList.remove('hidden');
    $('#detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    alertMessage(error instanceof Error ? error.message : 'No se pudo cargar el grupo.', true);
  }
}

async function load() {
  const data = await get<{ grupos: GrupoResumen[] }>('/api/fuente');
  groups = data.grupos;
  const suma = (tipo: string) => groups.filter(g => g.tipo === tipo).reduce((n, g) => n + g.total, 0);
  $('#exam-count').textContent = String(suma('examen'));
  $('#interview-count').textContent = String(suma('entrevistas'));
  $('#group-count').textContent = String(groups.length);
  $('#login').classList.add('hidden');
  $('#dashboard').classList.remove('hidden');
  $('#logout').classList.remove('hidden');
  paint();
}

$<HTMLFormElement>('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const formulario = e.currentTarget as HTMLFormElement;
  try {
    const datos = new FormData(formulario);
    await post('/api/sesion', { usuario: String(datos.get('usuario')), clave: String(datos.get('clave')) });
    formulario.reset(); // no dejar la contraseña en el formulario
    $('#alert').classList.add('hidden');
    await load();
  } catch (error) {
    alertMessage(error instanceof Error ? error.message : 'No se pudo ingresar.', true);
  }
});

$('#logout').addEventListener('click', async () => {
  try { await post('/api/salir', {}); } finally { location.reload(); }
});

$('#search').addEventListener('input', paint);
$('#type').addEventListener('change', paint);

$('#sync').addEventListener('click', async () => {
  try {
    const data = await post<{ importadas: number }>('/api/sincronizar-aulas', {});
    const all = await get<{ aulas: AulaInstitucional[] }>('/api/datos');
    const rooms = all.aulas.filter(a => a.codigo);
    $('#room-status').textContent = rooms.length ? rooms.map(a => `${a.nombre} (${a.capacidad})`).join(' · ') : 'No hay aulas habilitadas con capacidad en el catálogo.';
    alertMessage(`Se sincronizaron ${data.importadas} aulas institucionales.`);
  } catch (error) {
    alertMessage(error instanceof Error ? error.message : 'No se pudo sincronizar.', true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

$<HTMLInputElement>('#select-all').addEventListener('change', e => {
  const checked = (e.target as HTMLInputElement).checked;
  document.querySelectorAll<HTMLInputElement>('#people input[type=checkbox]').forEach(c => { c.checked = checked; });
});

$<HTMLFormElement>('#transfer').addEventListener('submit', async e => {
  e.preventDefault();
  const documentos = [...document.querySelectorAll<HTMLInputElement>('#people input:checked')].map(c => c.value);
  const destino = Number($<HTMLSelectElement>('#destination').value);
  try {
    await post('/api/trasladar', { origen: currentGroup, destino, documentos });
    await load();
    await showGroup(currentGroup);
    alertMessage(`Se trasladaron ${documentos.length} postulantes en esta copia local.`);
  } catch (error) {
    alertMessage(error instanceof Error ? error.message : 'No se pudo guardar.', true);
  }
});

load().catch(() => { /* sin sesión: se muestra el formulario de acceso */ });

export {};
