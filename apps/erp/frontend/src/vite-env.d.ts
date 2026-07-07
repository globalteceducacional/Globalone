/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** Limite global (MB) por arquivo. Padrão 2048. Backend: `UPLOAD_MAX_MB`. */
  readonly VITE_UPLOAD_MAX_MB?: string;
  /** Anexos da descrição do projeto. Padrão 2048 MB. */
  readonly VITE_UPLOAD_DESCRICAO_PROJETO_MAX_MB?: string;
  /** Anexos de tarefas / Meu Trabalho. Padrão 2048 MB. */
  readonly VITE_UPLOAD_TAREFA_MAX_MB?: string;
  /** Anexos genéricos (estoque, RH, /uploads). Padrão 2048 MB. */
  readonly VITE_UPLOAD_GENERIC_MAX_MB?: string;
  /** Vídeos de treinamento RH. Padrão 2048 MB. */
  readonly VITE_UPLOAD_TREINAMENTO_MAX_MB?: string;
  readonly VITE_UPLOAD_MAX_FILES_PER_REQUEST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
