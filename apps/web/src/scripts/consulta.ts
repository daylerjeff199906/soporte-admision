import { el, puntos } from './dom.ts';
import { CLAVE_RESULTADO } from './tipos.ts';
import { consultarDni, SIN_PROGRAMACION } from './api.ts';

const form = el<HTMLFormElement>('#form');
const input = el<HTMLInputElement>('#dni');
const submit = el<HTMLButtonElement>('#submit');
const hint = el<HTMLElement>('#hint');
const cargando = el<HTMLElement>('#cargando');
el('#cargando-puntos').append(puntos('size-3.5'));

input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 8); });

function mensaje(texto: string, error = false) {
  hint.textContent = texto;
  hint.className = `mt-3 text-sm ${error ? 'text-[#a11]' : 'text-graphite'}`;
}

function mostrarCarga(visible: boolean) {
  cargando.classList.toggle('hidden', !visible);
  cargando.classList.toggle('flex', visible);
  submit.disabled = visible;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const dni = input.value.trim();
  if (!/^\d{8}$/.test(dni)) { mensaje('Ingresa un DNI de 8 dígitos.', true); return; }
  mensaje('');
  mostrarCarga(true);
  let navegando = false;
  try {
    const data = await consultarDni(dni);
    if (!data) { mensaje(SIN_PROGRAMACION, true); return; }
    sessionStorage.setItem(CLAVE_RESULTADO, JSON.stringify(data));
    navegando = true; // el overlay se queda hasta que cargue la página de detalle
    location.assign(`/consulta/detalle/?dni=${dni}`);
  } catch (error) {
    mensaje(error instanceof Error ? error.message : 'No se pudo consultar.', true);
  } finally {
    if (!navegando) mostrarCarga(false);
  }
});

// Al volver con el botón "atrás" el navegador puede restaurar la página con el overlay encendido.
window.addEventListener('pageshow', e => { if (e.persisted) mostrarCarga(false); });
