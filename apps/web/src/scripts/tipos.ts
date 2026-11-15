export interface Actividad {
  tipo: 'examen' | 'entrevistas';
  programa: string;
  aula: string | number;
  sede?: string;
  fecha?: string;
  grupo?: string;
  aula_espera?: string | number;
  instrucciones?: string;
}

export interface Postulante {
  documento: string;
  nombre: string;
  /** URL de la foto, cuando SIGAE la proporciona. */
  foto?: string;
}

export interface EstadoSigae {
  verificado: boolean;
  activo: boolean;
  observacion: string | null;
}

export interface Respuesta {
  postulante: Postulante | null;
  actividades: Actividad[];
  /** Estado en SIGAE: `null` si SIGAE no respondió. */
  sigae?: EstadoSigae | null;
  error?: string;
}

/** Clave de sessionStorage donde la consulta deja el resultado para la página de detalle (el DNI no viaja en la URL). */
export const CLAVE_RESULTADO = 'consulta:resultado';
