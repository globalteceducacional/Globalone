import { api } from './api';
import type { PatenteDocumentoItem, PatentePastaItem } from '../constants/patentesDocumentosLabels';

export async function listarPatentesPastas() {
  const { data } = await api.get<PatentePastaItem[]>('/patentes-documentos/pastas');
  return data;
}

export async function obterPatentePasta(pastaId: number) {
  const { data } = await api.get<PatentePastaItem>(`/patentes-documentos/pastas/${pastaId}`);
  return data;
}

export async function criarPatentePasta(nome: string, descricao?: string) {
  const { data } = await api.post<PatentePastaItem>('/patentes-documentos/pastas', {
    nome,
    descricao,
  });
  return data;
}

export async function deletarPatentePasta(pastaId: number) {
  await api.delete(`/patentes-documentos/pastas/${pastaId}`);
}

export async function listarDocumentosDaPasta(pastaId: number) {
  const { data } = await api.get<PatenteDocumentoItem[]>(
    `/patentes-documentos/pastas/${pastaId}/documentos`,
  );
  return data;
}

export async function uploadDocumentoNaPasta(pastaId: number, fd: FormData) {
  const { data } = await api.post<PatenteDocumentoItem>(
    `/patentes-documentos/pastas/${pastaId}/upload`,
    fd,
  );
  return data;
}

export async function arquivarDocumentoGerado(body: {
  documentoGlobaltecId: number;
  pastaId?: number;
  novaPastaNome?: string;
  novaPastaDescricao?: string;
}) {
  const { data } = await api.post('/patentes-documentos/arquivar-gerado', body);
  return data;
}

export async function deletarPatenteDocumento(id: number) {
  await api.delete(`/patentes-documentos/documentos/${id}`);
}
