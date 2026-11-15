/**
 * Consulta a SIGAE (api.postgradounap.edu.pe).
 *
 * - person/person/?document_number=<dni>      → nombres y foto de la persona.
 * - admission/applicantfile/?person_uuid=…&promotion_convocatory__convocatory__uuid=…
 *                                             → ficha de postulación en la convocatoria (is_active).
 *
 * El servicio `academic/` corresponde a estudiantes matriculados, no a postulantes.
 */
export interface PerfilSigae {
  nombre: string;
  foto: string | null;
  /** Tiene una ficha de postulación en la convocatoria configurada (aunque esté inactiva). */
  inscrito: boolean;
  /** La ficha de postulación está activa. */
  activo: boolean;
}

/** Estado que se muestra al postulante en el detalle. */
export interface EstadoSigae {
  /** Su inscripción fue encontrada en SIGAE. */
  verificado: boolean;
  activo: boolean;
  /** Mensaje para el postulante cuando algo queda pendiente; `null` si todo está en orden. */
  observacion: string | null;
}

export function estadoSigae(perfil: PerfilSigae): EstadoSigae {
  if (!perfil.inscrito) return { verificado: false, activo: false, observacion: 'No encontramos tu inscripción en el sistema SIGAE. Queda pendiente para su verificación posterior.' };
  if (!perfil.activo) return { verificado: true, activo: false, observacion: 'En el sistema SIGAE figura como inactivo. Queda pendiente para su verificación posterior.' };
  return { verificado: true, activo: true, observacion: null };
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

interface PersonaSigae { uuid: string; document_number: string; names: string; last_name1: string; last_name2: string; photo: string | null }
interface FichaSigae { is_active: boolean }

const baseUrl = () => process.env.SIGAE_API_URL ?? 'https://api.postgradounap.edu.pe/';
/** Convocatoria de admisión 2026-II. */
const convocatoria = () => process.env.SIGAE_CONVOCATORIA ?? 'adc6bcb2-4935-48f0-9ed8-c55454aad806';

const TTL = 10 * 60_000;
const cache = new Map<string, { vence: number; valor: PerfilSigae | null }>();

async function obtener<T>(ruta: string, fetcher: Fetcher): Promise<T> {
  const respuesta = await fetcher(new URL(ruta, baseUrl()).href, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
  if (!respuesta.ok) throw new Error(`SIGAE respondió ${respuesta.status}`);
  return (await respuesta.json()) as T;
}

/** Devuelve el perfil del postulante en SIGAE (`inscrito: false` si no figura) o `null` si SIGAE no responde. */
export async function consultarSigae(dni: string, fetcher: Fetcher = fetch): Promise<PerfilSigae | null> {
  const guardado = cache.get(dni);
  if (guardado && guardado.vence > Date.now()) return guardado.valor;
  let valor: PerfilSigae | null = null;
  try {
    const personas = await obtener<{ results: PersonaSigae[] }>(`person/person/?document_number=${dni}`, fetcher);
    const persona = personas.results.find(p => p.document_number === dni);
    if (!persona) {
      valor = { nombre: '', foto: null, inscrito: false, activo: false };
    } else {
      const fichas = await obtener<FichaSigae[]>(`admission/applicantfile/?person_uuid=${encodeURIComponent(persona.uuid)}&promotion_convocatory__convocatory__uuid=${convocatoria()}`, fetcher);
      valor = {
        nombre: [persona.last_name1, persona.last_name2, persona.names].filter(Boolean).join(' ').trim(),
        foto: persona.photo?.startsWith('https://') ? persona.photo : null,
        inscrito: fichas.length > 0,
        activo: fichas.some(f => f.is_active),
      };
    }
  } catch (error) {
    console.warn('SIGAE no disponible:', error instanceof Error ? error.message : error);
    return null; // no se guarda en caché: se reintenta en la próxima consulta
  }
  cache.set(dni, { vence: Date.now() + TTL, valor });
  return valor;
}
