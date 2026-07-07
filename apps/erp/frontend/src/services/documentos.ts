import { api } from './api';

export interface DocumentoConfidencialidade {
  id: number;
  nomeExibicao: string;
  url: string;
  criadoEm: string;
}

export interface ConviteConfidencialidadePendente {
  id: number;
  token: string;
  titulo: string | null;
  criadoEm: string;
  expiresAt: string | null;
}

export interface ConfidencialidadeUsuarioResponse {
  documento: DocumentoConfidencialidade | null;
  convitePendente: ConviteConfidencialidadePendente | null;
}

export async function getConfidencialidadeUsuario(usuarioId: number) {
  const { data } = await api.get<ConfidencialidadeUsuarioResponse>(
    `/documentos/confidencialidade/usuario/${usuarioId}`,
  );
  return data;
}
