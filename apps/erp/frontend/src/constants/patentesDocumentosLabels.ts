export type CategoriaPatenteDocumento =
  | 'patente'
  | 'aplicacao'
  | 'certificado'
  | 'termo'
  | 'outro';

export type OrigemPatenteDocumento = 'gerado' | 'upload';

export interface PatentePastaItem {
  id: number;
  nome: string;
  descricao: string | null;
  sistema: boolean;
  criadoEm: string;
  totalDocumentos: number;
  criadoPor: { id: number; nome: string };
}

export interface PatenteDocumentoItem {
  id: number;
  categoria: CategoriaPatenteDocumento;
  nomeExibicao: string;
  descricao: string | null;
  numeroReferencia: string | null;
  url: string;
  origem: OrigemPatenteDocumento;
  pastaId: number | null;
  criadoEm: string;
  criadoPor: { id: number; nome: string };
  pasta?: { id: number; nome: string } | null;
  documentoGlobaltec?: { id: number; tipo: string; usuarioId: number | null } | null;
}

export const CATEGORIA_PATENTE_LABEL: Record<CategoriaPatenteDocumento, string> = {
  patente: 'Patente',
  aplicacao: 'Aplicação',
  certificado: 'Certificado',
  termo: 'Termo',
  outro: 'Arquivo',
};

export const CATEGORIA_PATENTE_BADGE: Record<CategoriaPatenteDocumento, string> = {
  patente: 'bg-amber-500/20 text-amber-300',
  aplicacao: 'bg-cyan-500/20 text-cyan-300',
  certificado: 'bg-blue-500/20 text-blue-300',
  termo: 'bg-purple-500/20 text-purple-300',
  outro: 'bg-white/10 text-white/60',
};
