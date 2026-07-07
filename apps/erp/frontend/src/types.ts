export interface CargoPermission {
  id: number;
  modulo: string;
  acao: string;
  chave: string;
  descricao?: string | null;
}

export interface Cargo {
  id: number;
  nome: string;
  descricao?: string | null;
  ativo: boolean;
  paginasPermitidas?: string[];
  dataCriacao: string;
  permissions?: CargoPermission[];
  _count?: {
    usuarios: number;
  };
}

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  cargo: Cargo;
  ativo: boolean;
  telefone?: string | null;
  /** CPF (11 dígitos, sem pontuação). */
  cpf?: string | null;
  formacao?: string | null;
  funcao?: string | null;
  dataNascimento?: string | null;
  biografiaResumo?: string | null;
  habilidades?: string | null;
  linkLattes?: string | null;
  linkPortfolio?: string | null;
  linkLinkedin?: string | null;
  dadosContato?: string | null;
  /** Chave PIX ou identificador para pagamento (informado no perfil). */
  pix?: string | null;
  /** Endereço (texto livre). */
  endereco?: string | null;
  dataEntrada?: string | null;
  /** Caminho público da foto (ex.: `/uploads/profiles/profile-1-....jpg`). */
  fotoUrl?: string | null;
  /** Pontos acumulados por tarefas de checklist aprovadas. */
  pontosTarefas?: number;
}

export interface Setor {
  id: number;
  nome: string;
  descricao?: string | null;
  ativo?: boolean;
}

export interface ProjetoArquivo {
  originalName: string;
  url: string;
  mimeType?: string;
  size?: number;
}

export interface Projeto {
  id: number;
  nome: string;
  status: 'EM_ANDAMENTO' | 'FINALIZADO';
  // Legado (projeto com 1 setor)
  setorId?: number | null;
  setor?: { id: number; nome: string } | null;
  // Novo (projeto com múltiplos setores responsáveis)
  setores?: { id: number; nome: string }[];
  resumo?: string | null;
  objetivo?: string | null;
  descricaoLonga?: string | null;
  descricaoArquivos?: ProjetoArquivo[] | null;
  valorTotal: number;
  valorInsumos: number;
  supervisor?: Usuario | null;
  /** Integrantes da equipe do projeto (não confundir com supervisor/responsável). */
  responsaveis?: { usuario: Usuario }[];
  /** Membros automáticos de setor removidos manualmente da equipe. */
  responsaveisExcluidos?: { usuarioId: number }[];
  _count?: { etapas: number };
  progress?: number;
  /** Soma de itens principais do checklist em todas as etapas (lista / dashboard). */
  checklistItensTotal?: number;
  checklistItensConcluidos?: number;
}

export interface Etapa {
  id: number;
  nome: string;
  descricao?: string | null;
  status: 'PENDENTE' | 'EM_ANDAMENTO' | 'EM_ANALISE' | 'APROVADA' | 'REPROVADA';
  dataInicio?: string | null;
  dataFim?: string | null;
  projetoId?: number;
  projeto: Projeto;
  executor: Usuario;
  responsavelId?: number | null;
  responsavel?: Usuario | null;
  integrantes?: Array<{ usuario: Usuario }>;
}

export interface EtapaEntrega {
  id: number;
  descricao: string;
  imagemUrl?: string | null;
  status: 'EM_ANALISE' | 'APROVADA' | 'RECUSADA';
  dataEnvio: string;
  comentario?: string | null;
  dataAvaliacao?: string | null;
  executorId?: number;
  executor: Usuario;
  avaliadoPor?: Usuario | null;
}

export interface ChecklistItemEntrega {
  id: number;
  checklistIndex: number;
  subitemIndex?: number | null;
  /** Id estável da tarefa no checklistJson (persistido no backend). */
  checklistItemId?: string | null;
  subitemId?: string | null;
  executorId?: number;
  descricao: string;
  imagemUrl?: string | null; // Mantido para compatibilidade (deprecated)
  documentoUrl?: string | null; // Mantido para compatibilidade (deprecated)
  imagensUrls?: string[] | null; // Array de imagens (base64 ou URLs)
  documentosUrls?: string[] | null; // Array de documentos (base64 ou URLs)
  status: 'PENDENTE' | 'EM_ANALISE' | 'APROVADO' | 'REPROVADO';
  dataEnvio: string;
  comentario?: string | null;
  executor?: Usuario | null;
  avaliadoPor?: Usuario | null;
  dataAvaliacao?: string | null;
}

export interface Notificacao {
  id: number;
  titulo: string;
  mensagem: string;
  tipo: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  lida: boolean;
  dataCriacao: string;
  requerimentoId?: number | null;
  etapaId?: number | null;
  /** Presente em avisos de evento extra do calendário (viagem, feriado, etc.). */
  calendarioEventoId?: number | null;
  etapa?: {
    id: number;
    projetoId: number;
    dataFim?: string | null;
  } | null;
}

/** Subtarefa (filha) — persiste em `checklistJson[].subitens` no backend. */
export interface ChecklistSubItem {
  /** Identificador estável — anexos/entregas são remapeados por este id ao reordenar. */
  id?: string;
  texto: string;
  concluido?: boolean;
  descricao?: string;
  // NÃO tem `pontos` próprio. O valor é calculado em runtime:
  // Math.max(1, floor(item.pontos / item.subitens.length))
}

/** Tarefa da etapa — persiste como elemento de `checklistJson` no backend. */
export interface ChecklistItem {
  /** Identificador estável — anexos/entregas são remapeados por este id ao reordenar. */
  id?: string;
  texto: string;
  concluido?: boolean;
  descricao?: string;
  /** Pontos ao aprovar o item principal (padrão 1 se omitido). */
  pontos?: number;
  /** Se vazio ou omitido, todos os integrantes da etapa veem a tarefa em Meu trabalho. */
  integrantesIds?: number[];
  subitens?: ChecklistSubItem[];
}