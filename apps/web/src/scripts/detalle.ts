import { ArrowRight, BadgeCheck, CalendarDays, ChevronRight, CircleAlert, CircleCheck, CircleX, Clock, DoorOpen, ListChecks, MapPin, type IconNode } from 'lucide';
import { el, h, icono, puntos } from './dom.ts';
import { consultarDni, SIN_PROGRAMACION } from './api.ts';
import { CLAVE_RESULTADO, type Actividad, type EstadoSigae, type Postulante, type Respuesta } from './tipos.ts';

type Completa = Respuesta & { postulante: Postulante };
interface Chip { icono?: IconNode; texto: string }

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const nombrePropio = (s: string) => s.toLocaleLowerCase('es').replace(/(^|\s)(\p{L})/gu, (_, sp: string, c: string) => sp + c.toLocaleUpperCase('es'));
const iniciales = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const unicos = (xs: string[]) => [...new Set(xs)];

/** La fuente del examen no trae fecha propia; la fecha y el horario vienen dentro de las indicaciones. */
function fechaDe(a: Actividad): string | null {
  if (a.fecha) return a.fecha;
  const m = a.instrucciones?.match(/(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+\d{2}\/\d{2}\/\d{4}/i);
  return m ? capitalizar(m[0]) : null;
}
const ingresoDe = (a: Actividad): string | null => a.instrucciones?.match(/ingreso de ([^.]*\.\s?m\.)/i)?.[1] ?? null;

/** "5A" se muestra como "Aula 5A"; un nombre de lugar (p. ej. una filial) se muestra tal cual. */
const lugarDe = (a: Actividad): { etiqueta: string; valor: string } =>
  String(a.aula).length <= 4 ? { etiqueta: 'Ubicación', valor: `Aula ${a.aula}` } : { etiqueta: 'Lugar', valor: String(a.aula) };

function dato(etiqueta: string, valor: string): HTMLElement {
  const box = h('div', 'min-w-0');
  box.append(h('dt', 'label', etiqueta), h('dd', 'mt-1.5 text-base font-normal leading-snug', valor));
  return box;
}

function chip({ icono: nodo, texto }: Chip): HTMLElement {
  const c = h('span', 'inline-flex items-center gap-1.5 rounded-xs bg-brand-tint px-2.5 py-1 text-xs font-normal text-brand');
  if (nodo) c.append(icono(nodo, 'size-3.5'));
  c.append(texto);
  return c;
}

/**
 * Sección expandible: cerrada muestra título, chips y una línea de vista previa; al abrirla, el detalle.
 * Usa <details>, por lo que el teclado y los lectores de pantalla funcionan sin código extra.
 */
function acordeon(numero: string, titulo: string, chips: Chip[], subtitulo: string, abierto: boolean): { root: HTMLElement; body: HTMLElement } {
  const root = h('details', 'group rounded-xs border border-hairline bg-white');
  root.open = abierto;
  const resumen = h('summary', 'flex cursor-pointer list-none items-start gap-4 px-6 py-5 transition-colors hover:bg-cream md:px-8 [&::-webkit-details-marker]:hidden');
  const info = h('div', 'min-w-0 flex-1');
  const fila = h('div', 'flex flex-wrap items-center gap-x-3 gap-y-2');
  fila.append(h('span', 'label', numero), h('h2', 'text-xl font-normal leading-tight tracking-[-0.2px]', titulo), ...chips.map(chip));
  info.append(fila, h('p', 'mt-1.5 text-sm text-iron', subtitulo));
  resumen.append(icono(ChevronRight, 'mt-1 size-5 shrink-0 text-graphite transition-transform duration-200 group-open:rotate-90'), info);
  const body = h('div', 'border-t border-hairline p-6 md:p-8');
  root.append(resumen, body);
  return { root, body };
}

/** Tarjeta fija (no desplegable): encabezado con barra y contenido siempre visible. */
function seccionFija(numero: string, titulo: string): { root: HTMLElement; body: HTMLElement } {
  const root = h('section', 'rounded-xs border border-hairline bg-white');
  const head = h('header', 'flex items-center gap-3 border-b border-hairline px-6 py-4 md:px-8');
  head.append(h('span', 'inline-block h-4 w-1 bg-brand'), h('h2', 'label text-ink', `${numero} · ${titulo}`));
  const body = h('div', 'p-6 md:p-8');
  root.append(head, body);
  return { root, body };
}

/** Estado en SIGAE: dos insignias (verificación e inscripción) y, si algo queda pendiente, la observación. */
function estadoSigae(s: EstadoSigae, conObservacion = true): HTMLElement {
  const insignia = (ok: boolean, nodo: IconNode, texto: string) => {
    const b = h('span', `inline-flex items-center gap-1.5 rounded-xs px-2.5 py-1 text-xs font-normal ${ok ? 'bg-brand-tint text-brand' : 'bg-[#a11]/10 text-[#a11]'}`);
    b.append(icono(nodo, 'size-3.5'), texto);
    return b;
  };
  const caja = h('div', 'mt-6 space-y-3');
  const fila = h('div', 'flex flex-wrap gap-2');
  fila.append(
    insignia(s.verificado, s.verificado ? BadgeCheck : CircleAlert, s.verificado ? 'Verificado en SIGAE' : 'Sin verificar'),
    insignia(s.activo, s.activo ? CircleCheck : CircleX, s.activo ? 'Estado: Activo' : 'Estado: Inactivo'),
  );
  caja.append(fila);
  if (conObservacion && s.observacion) {
    const nota = h('p', 'rounded-xs border border-hairline bg-cream px-4 py-3 text-sm leading-relaxed text-graphite');
    nota.append(h('strong', 'font-medium text-ink', 'Observación: '), s.observacion);
    caja.append(nota);
  }
  return caja;
}

function seccionPostulante(p: Postulante, actividades: Actividad[], sigae: Respuesta['sigae']): HTMLElement {
  const sinProgramacion = actividades.length === 0;
  const { root, body } = seccionFija('01', 'Información del postulante');
  const fila = h('div', 'flex flex-col gap-6 sm:flex-row sm:items-start');

  const foto = h('div', 'flex h-40 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xs border border-hairline bg-brand-tint');
  if (p.foto) {
    const img = h('img', 'h-full w-full object-cover');
    img.src = p.foto;
    img.alt = `Foto de ${nombrePropio(p.nombre)}`;
    foto.append(img);
  } else {
    foto.setAttribute('role', 'img');
    foto.setAttribute('aria-label', 'Foto no disponible');
    foto.append(h('span', 'text-[44px] font-light tracking-[-1px] text-brand', iniciales(p.nombre)));
  }

  const datos = h('div', 'min-w-0 flex-1');
  datos.append(h('p', 'label', 'Postulante'), h('p', 'mt-2 text-[28px] font-light leading-[1.15] tracking-[-0.64px] md:text-[32px]', nombrePropio(p.nombre)));
  const lista = h('dl', 'mt-6 grid gap-x-6 gap-y-5 sm:grid-cols-2');
  lista.append(dato('Documento', p.documento));
  const programas = unicos(actividades.map(a => a.programa));
  if (programas.length) lista.append(dato(programas.length > 1 ? 'Programas' : 'Programa', programas.join(' · ')));
  datos.append(lista);
  if (sigae) datos.append(estadoSigae(sigae, !sinProgramacion)); // sin programación, la observación va en su propia tarjeta

  fila.append(foto, datos);
  body.append(fila);
  return root;
}

function detalle(a: Actividad): HTMLElement {
  const lugar = lugarDe(a);
  const caja = h('div', 'sm:grid sm:grid-cols-[minmax(0,200px)_1fr] sm:gap-10');
  const aula = h('div', 'min-w-0');
  aula.append(h('p', 'label', lugar.etiqueta), h('p', 'mt-2 text-[28px] font-light leading-[1.15] tracking-[-0.64px] text-brand md:text-[32px]', lugar.valor));

  const datos = h('dl', 'mt-8 grid gap-x-6 gap-y-5 sm:mt-0 sm:grid-cols-2');
  const fecha = fechaDe(a), ingreso = ingresoDe(a);
  if (fecha) datos.append(dato('Fecha', fecha));
  if (ingreso) datos.append(dato('Ingreso', ingreso));
  if (a.aula_espera) datos.append(dato('Aula de espera', `Aula ${a.aula_espera}`));
  if (a.sede) datos.append(dato('Sede', a.sede));
  if (a.grupo) datos.append(dato('Grupo', a.grupo));
  datos.append(dato('Programa', a.programa));
  caja.append(aula, datos);
  return caja;
}

/** Vista previa de una actividad: aula, fecha y, según el caso, hora de ingreso o aula de espera. */
function chipsActividad(a: Actividad | undefined): Chip[] {
  if (!a) return [];
  const chips: Chip[] = [{ icono: MapPin, texto: lugarDe(a).valor }];
  const fecha = fechaDe(a), ingreso = ingresoDe(a);
  if (fecha) chips.push({ icono: CalendarDays, texto: fecha });
  if (ingreso) chips.push({ icono: Clock, texto: ingreso });
  if (a.aula_espera) chips.push({ icono: DoorOpen, texto: `Espera: Aula ${a.aula_espera}` });
  return chips;
}

function seccionActividad(numero: string, titulo: string, items: Actividad[], vacio: string, abierto: boolean): HTMLElement {
  const programas = unicos(items.map(a => a.programa)).join(' · ');
  const { root, body } = acordeon(numero, titulo, chipsActividad(items[0]), items.length ? programas : vacio, abierto);
  if (!items.length) body.append(h('p', 'text-sm leading-6 text-iron', vacio));
  items.forEach((a, i) => {
    if (i) body.append(h('hr', 'my-8 border-hairline'));
    body.append(detalle(a));
  });
  return root;
}

/** Divide las indicaciones del Excel en frases, sin repetir las que coinciden entre grupos. */
function frases(items: Actividad[]): string[] {
  return unicos(items.flatMap(a => (a.instrucciones ?? '').split(/(?<=\.)\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/).map(f => f.trim()).filter(Boolean)));
}

function bloqueIndicaciones(titulo: string, items: Actividad[]): HTMLElement | null {
  const lista = frases(items);
  if (!lista.length) return null;
  const bloque = h('div', 'rounded-xs bg-cream p-5');
  bloque.append(h('h3', 'label text-ink', titulo));
  const ul = h('ul', 'mt-3 space-y-2 text-sm leading-6 text-iron');
  for (const f of lista) {
    const li = h('li', 'flex gap-3');
    li.append(h('span', 'mt-2 inline-block size-1.5 shrink-0 bg-brand'), h('span', '', f));
    ul.append(li);
  }
  bloque.append(ul);
  return bloque;
}

/** Paso del diagrama: número, etiqueta, valor destacado y una línea de explicación. */
function paso(numero: number, etiqueta: string, valor: string, texto: string): HTMLElement {
  const nodo = h('div', 'flex-1 rounded-xs border border-hairline bg-white p-5');
  const cabecera = h('div', 'flex items-center gap-3');
  cabecera.append(h('span', 'inline-flex size-7 shrink-0 items-center justify-center bg-brand text-sm font-normal text-white', String(numero)), h('span', 'label', etiqueta));
  nodo.append(cabecera, h('p', 'mt-4 text-[28px] font-light leading-[1.15] tracking-[-0.64px] text-brand md:text-[32px]', valor), h('p', 'mt-2 text-sm leading-6 text-iron', texto));
  return nodo;
}

/** Flecha entre pasos: horizontal en pantallas grandes, hacia abajo en móvil. */
function flecha(): HTMLElement {
  const f = h('span', 'flex shrink-0 rotate-90 items-center justify-center text-brand md:rotate-0');
  f.append(icono(ArrowRight, 'size-6'));
  return f;
}

/** Diagrama de la entrevista: llegada, aula de espera y aula de entrevista asignada. */
function bloqueFlujoEntrevista(items: Actividad[]): HTMLElement | null {
  if (!items.length) return null;
  const bloque = h('div', 'rounded-xs bg-cream p-5');
  bloque.append(h('h3', 'label text-ink', 'Entrevista personal · cómo es el flujo'));
  items.forEach((a, i) => {
    const pasos: HTMLElement[] = [paso(1, 'Llegada', fechaDe(a) ?? 'Día de tu entrevista', 'Preséntate en la fecha indicada y espera las indicaciones del personal.')];
    if (a.aula_espera) pasos.push(paso(pasos.length + 1, 'Aula de espera', `Aula ${a.aula_espera}`, 'Ingresa al aula de espera y aguarda tu turno. Se respeta el orden de llegada.'));
    pasos.push(paso(pasos.length + 1, 'Aula de entrevista', lugarDe(a).valor, 'Pasas a tu aula de entrevista asignada, siguiendo el orden de llegada.'));
    const flujo = h('div', `${i ? 'mt-6 ' : 'mt-4 '}flex flex-col items-stretch gap-3 md:flex-row md:items-stretch`);
    pasos.forEach((p, j) => { if (j) flujo.append(flecha()); flujo.append(p); });
    bloque.append(flujo);
  });
  bloque.append(h('p', 'mt-5 text-sm leading-6 text-iron', 'Se respetará el orden de llegada: quienes llegan primero pasan primero al aula de entrevista asignada.'));
  return bloque;
}

function seccionIndicaciones(examenes: Actividad[], entrevistas: Actividad[]): HTMLElement | null {
  const bloques = [bloqueIndicaciones('Examen de admisión', examenes), bloqueFlujoEntrevista(entrevistas)].filter((b): b is HTMLElement => !!b);
  if (!bloques.length) return null;
  const chips: Chip[] = [];
  if (examenes.length) chips.push({ icono: ListChecks, texto: 'Examen' });
  if (entrevistas.length) chips.push({ icono: ListChecks, texto: 'Entrevista' });
  const { root, body } = acordeon('04', 'Indicaciones', chips, 'Qué debes tener en cuenta el día de tu examen y de tu entrevista', false);
  body.className = 'grid gap-4 border-t border-hairline p-6 md:p-8';
  body.append(...bloques);
  return root;
}

/** Postulante que figura en SIGAE pero no tiene examen asignado: se explica por qué según el estado de su inscripción. */
function tarjetaSinProgramacion(s: Respuesta['sigae']): HTMLElement {
  const texto = !s ? 'Aún no tienes programación asignada. Comunícate con Admisión.'
    : !s.verificado ? 'Estás registrado en SIGAE, pero no encontramos una inscripción en la convocatoria 2026-II. Comunícate con Admisión.'
    : !s.activo ? 'Aún no tienes programación asignada porque en el sistema SIGAE tu inscripción figura como inactiva. Queda pendiente para su verificación posterior; cuando sea verificada podrás consultar aquí tu aula y horario.'
    : 'Tu inscripción figura activa en SIGAE, pero todavía no tienes examen programado. Vuelve a consultar más adelante o comunícate con Admisión.';
  const caja = h('section', 'rounded-xs border border-hairline bg-white p-6 md:p-8');
  caja.append(h('p', 'label', 'Sin programación'), h('p', 'mt-3 text-base leading-7 text-iron', texto));
  return caja;
}

function pintar(r: Completa) {
  if (!r.actividades.length) { el('#resultado').replaceChildren(seccionPostulante(r.postulante, [], r.sigae), tarjetaSinProgramacion(r.sigae)); return; }
  const examenes = r.actividades.filter(a => a.tipo === 'examen');
  const entrevistas = r.actividades.filter(a => a.tipo === 'entrevistas');
  const mismoDia = examenes.some(a => /entrevista personal el mismo d[ií]a/i.test(a.instrucciones ?? ''));
  el('#resultado').replaceChildren(...[
    seccionPostulante(r.postulante, r.actividades, r.sigae),
    // La evaluación (examen) es la sección que se muestra desplegada por defecto.
    seccionActividad('02', 'Examen de conocimientos', examenes, 'No encontramos un examen programado para tu DNI.', true),
    seccionActividad('03', 'Entrevista personal', entrevistas,
      mismoDia ? 'Tu entrevista personal se realiza el mismo día del examen, en el mismo lugar. Revisa las indicaciones del examen.' : 'Aún no tienes una entrevista programada.', false),
    seccionIndicaciones(examenes, entrevistas),
  ].filter((s): s is HTMLElement => !!s));
}

function pintarMensaje(texto: string) {
  const caja = h('div', 'rounded-xs border border-hairline bg-white p-6 md:p-8');
  caja.append(h('p', 'label', 'Sin resultados'), h('p', 'mt-3 text-base leading-7 text-iron', texto));
  el('#resultado').replaceChildren(caja);
}

// --- Datos: la consulta vive en la URL (?dni=) y sobrevive a recargas ---
const esDni = (v: string | null): v is string => !!v && /^\d{8}$/.test(v);
const dniDeUrl = () => new URLSearchParams(location.search).get('dni');

function leerCache(): Completa | null {
  try {
    const datos = JSON.parse(sessionStorage.getItem(CLAVE_RESULTADO) ?? 'null') as Respuesta | null;
    return datos?.postulante ? (datos as Completa) : null;
  } catch { return null; }
}
const guardar = (r: Respuesta) => sessionStorage.setItem(CLAVE_RESULTADO, JSON.stringify(r));

const cargando = el<HTMLElement>('#cargando');
el('#cargando-puntos').append(puntos('size-3.5'));
function cargaPagina(visible: boolean) {
  cargando.classList.toggle('hidden', !visible);
  cargando.classList.toggle('flex', visible);
}

async function cargarDesdeUrl() {
  const dni = dniDeUrl();
  if (!esDni(dni)) { location.replace('/consulta/'); return; }
  const guardado = leerCache();
  if (guardado?.postulante.documento === dni) { pintar(guardado); return; } // evita repetir la consulta recién hecha
  cargaPagina(true);
  try {
    const data = await consultarDni(dni);
    if (!data) { pintarMensaje(SIN_PROGRAMACION); return; }
    guardar(data);
    pintar(data as Completa);
  } catch (error) {
    pintarMensaje(error instanceof Error ? error.message : 'No se pudo consultar.');
  } finally {
    cargaPagina(false);
  }
}

void cargarDesdeUrl();
window.addEventListener('popstate', () => { void cargarDesdeUrl(); });

document.querySelectorAll('[data-volver]').forEach(b => b.addEventListener('click', () => {
  if (history.length > 1) history.back(); else location.assign('/consulta/');
}));

// --- Modal "Consultar otro DNI" ---
const modal = el<HTMLDialogElement>('#modal-dni');
const formModal = el<HTMLFormElement>('#form-modal');
const inputModal = el<HTMLInputElement>('#dni-modal');
const submitModal = el<HTMLButtonElement>('#submit-modal');
const hintModal = el<HTMLElement>('#hint-modal');
const cargandoModal = el<HTMLElement>('#cargando-modal');
el('#cargando-modal-puntos').append(puntos('size-3'));

const mensajeModal = (texto: string) => { hintModal.textContent = texto; hintModal.className = `mt-3 min-h-5 text-sm ${texto ? 'text-[#a11]' : 'text-graphite'}`; };
function cargaModal(visible: boolean) {
  cargandoModal.classList.toggle('hidden', !visible);
  cargandoModal.classList.toggle('flex', visible);
  submitModal.disabled = visible;
  inputModal.disabled = visible;
}

document.querySelectorAll('[data-otro]').forEach(b => b.addEventListener('click', () => {
  formModal.reset();
  mensajeModal('');
  modal.showModal();
  inputModal.focus();
}));
modal.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', () => modal.close()));
modal.addEventListener('click', e => { if (e.target === modal) modal.close(); }); // clic en el fondo oscuro
inputModal.addEventListener('input', () => { inputModal.value = inputModal.value.replace(/\D/g, '').slice(0, 8); });

formModal.addEventListener('submit', async event => {
  event.preventDefault();
  const dni = inputModal.value.trim();
  if (!esDni(dni)) { mensajeModal('Ingresa un DNI de 8 dígitos.'); return; }
  mensajeModal('');
  cargaModal(true);
  try {
    const data = await consultarDni(dni);
    if (!data) { mensajeModal(SIN_PROGRAMACION); return; }
    guardar(data);
    history.pushState(null, '', `?dni=${dni}`); // la nueva consulta queda en la URL y en el historial
    pintar(data as Completa);
    modal.close();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    mensajeModal(error instanceof Error ? error.message : 'No se pudo consultar.');
  } finally {
    cargaModal(false);
    inputModal.focus();
  }
});
