import type { Respuesta } from './tipos.ts';

/** Consulta la programación de un DNI. Devuelve `null` si no hay programación y lanza un Error con el mensaje para el usuario si falla. */
export async function consultarDni(dni: string): Promise<Respuesta | null> {
  const response = await fetch('/api/consulta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dni }) });
  const data = (await response.json()) as Respuesta;
  if (!response.ok) throw new Error(data.error ?? 'No se pudo consultar.');
  return data.postulante && data.actividades.length ? data : null;
}

export const SIN_PROGRAMACION = 'No encontramos programación para el DNI ingresado. Verifica el número o comunícate con Admisión.';
