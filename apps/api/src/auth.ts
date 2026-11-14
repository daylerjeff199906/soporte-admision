import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/** Compara dos textos en tiempo constante (se comparan sus hashes para que no importe la longitud). */
export function iguales(a: string, b: string): boolean {
  const h = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(h(a), h(b));
}

export const DURACION_SESION_MS = 8 * 60 * 60 * 1000;

const firmar = (carga: string, secreto: string) => createHmac('sha256', secreto).update(carga).digest('base64url');

/** Crea un token de sesión firmado: `base64url({u,e}).firma`. No guarda contraseñas ni estado en el servidor. */
export function crearToken(usuario: string, secreto: string, ahora = Date.now(), duracion = DURACION_SESION_MS): string {
  const carga = Buffer.from(JSON.stringify({ u: usuario, e: ahora + duracion })).toString('base64url');
  return `${carga}.${firmar(carga, secreto)}`;
}

/** Devuelve el usuario si el token tiene firma válida y no venció; si no, `null`. */
export function usuarioDeToken(token: string | undefined, secreto: string, ahora = Date.now()): string | null {
  const [carga, firma] = token?.split('.') ?? [];
  if (!carga || !firma || !iguales(firma, firmar(carga, secreto))) return null;
  try {
    const { u, e } = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8')) as { u?: unknown; e?: unknown };
    return typeof u === 'string' && typeof e === 'number' && e > ahora ? u : null;
  } catch { return null; }
}

export interface Credenciales { usuario: string; clave: string; generada: boolean }

/**
 * Credenciales del panel: ADMIN_USER / ADMIN_PASSWORD del entorno (.env).
 * Si no hay contraseña configurada se genera una aleatoria y se guarda en `archivo` para no dejar el panel abierto.
 */
export function cargarCredenciales(env: NodeJS.ProcessEnv, archivo: string): Credenciales {
  const usuario = env.ADMIN_USER?.trim() || 'admin';
  if (env.ADMIN_PASSWORD) return { usuario, clave: env.ADMIN_PASSWORD, generada: false };
  if (!existsSync(archivo)) writeFileSync(archivo, `usuario: ${usuario}\nclave: ${randomBytes(18).toString('hex')}\n`, { mode: 0o600 });
  const texto = readFileSync(archivo, 'utf8');
  const clave = /^clave:\s*(\S+)/m.exec(texto)?.[1] ?? texto.trim(); // admite el formato anterior (solo la clave)
  return { usuario, clave, generada: true };
}

/** Secreto para firmar sesiones: SESSION_SECRET o uno aleatorio persistido en `archivo` (las sesiones sobreviven a reinicios). */
export function cargarSecreto(env: NodeJS.ProcessEnv, archivo: string): string {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (!existsSync(archivo)) writeFileSync(archivo, randomBytes(32).toString('hex'), { mode: 0o600 });
  return readFileSync(archivo, 'utf8').trim();
}
