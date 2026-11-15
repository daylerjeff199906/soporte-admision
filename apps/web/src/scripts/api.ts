import type { Respuesta } from './tipos.ts';

/**
 * Consulta un DNI. Devuelve `null` si no figura ni en la programación ni en SIGAE; si solo figura en SIGAE,
 * devuelve el postulante sin actividades. Lanza un Error con el mensaje para el usuario si falla.
 */
export async function consultarDni(dni: string): Promise<Respuesta | null> {
  const response = await fetch('/api/consulta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dni }) });
  const data = (await response.json()) as Respuesta;
  if (!response.ok) throw new Error(data.error ?? 'No se pudo consultar.');
  return data.postulante ? data : null;
}

export const SIN_PROGRAMACION = 'No encontramos al postulante con el DNI ingresado ni en la programación ni en el sistema SIGAE. Verifica el número o comunícate con Admisión.';
