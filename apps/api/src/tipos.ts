export type TipoGrupo = 'examen' | 'entrevistas';

export interface Postulante {
  documento: string;
  nombre: string;
}

export interface Grupo {
  tipo: TipoGrupo;
  hoja: string;
  programa: string;
  aula: string | number;
  sede?: string;
  fecha?: string;
  grupo?: string;
  aula_espera?: string;
  instrucciones?: string;
  postulantes: Postulante[];
}

export type GrupoResumen = Omit<Grupo, 'postulantes'>;

export interface Fuente {
  corte: string;
  grupos: Grupo[];
}

export type Entrada = Record<string, unknown>;
