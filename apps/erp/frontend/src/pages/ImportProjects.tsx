import React, { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { toast, formatApiError } from '../utils/toast';
import { btn } from '../utils/buttonStyles';
import { ExcelDownloadButton } from '../components/ExcelDownloadButton';
import { buildProjectsTemplateWorkbook } from '../utils/projectsExcelTemplate';
import { FileDropInput } from '../components/FileDropInput';

export default function ImportProjects() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (selectedFile?: File | null) => {
    if (selectedFile) {
      // Validar extensão
      const allowedExtensions = ['.xlsx', '.xls'];
      const fileExtension = selectedFile.name
        .toLowerCase()
        .substring(selectedFile.name.lastIndexOf('.'));
      
      if (!allowedExtensions.includes(fileExtension)) {
        setError('Formato de arquivo inválido. Use .xlsx ou .xls');
        setFile(null);
        return;
      }

      setError(null);
      setFile(selectedFile);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      setError('Selecione um arquivo Excel');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const { data } = await api.post('/projects/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      toast.success(data.message || 'Projetos importados com sucesso!');
      
      // Limpar formulário
      setFile(null);

      // Redirecionar para projetos após 1 segundo
      setTimeout(() => {
        navigate('/projects');
      }, 1000);
    } catch (err: any) {
      const errorMessage = formatApiError(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => navigate('/projects')}
            className="text-blue-400 hover:text-blue-300 mb-4 flex items-center gap-2"
          >
            ← Voltar para Projetos
          </button>
          <h1 className="text-3xl font-bold mb-2">Importar Projetos</h1>
          <p className="text-gray-400">
            Importe projetos completos com etapas e checklists a partir de uma planilha Excel
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Formato da Planilha</h2>
            <ExcelDownloadButton
              buildWorkbook={buildProjectsTemplateWorkbook}
              fileName="modelo-importacao-projetos.xlsx"
              label="Baixar modelo Excel"
              disabled={uploading}
              className={btn.success}
            />
          </div>
          <div className="space-y-4 text-gray-300">
            <div>
              <h3 className="font-semibold text-white mb-2">Aba "Projetos" (obrigatória na planilha, pode ficar vazia)</h3>
              <p className="text-sm mb-2">
                A aba deve existir, mas pode não ter nenhuma linha preenchida. Use vazia quando quiser apenas adicionar etapas ou tarefas da etapa a projetos já existentes no sistema.
              </p>
              <p className="text-sm mb-2">
                <strong>Regra:</strong> dois projetos não podem ter o mesmo nome (na planilha nem no sistema). Etapas e tarefas podem repetir nomes.
              </p>
              <p className="text-sm mb-2">Colunas:</p>
              <ul className="list-disc list-inside text-sm space-y-1 ml-4">
                <li><strong>nome</strong> (obrigatório por linha) - Nome único do projeto</li>
                <li><strong>resumo</strong> (opcional) - Resumo curto do projeto</li>
                <li><strong>objetivo</strong> (opcional) - Objetivo principal do projeto</li>
                <li><strong>valorTotal</strong> (opcional) - Orçamento total do projeto</li>
                <li><strong>supervisorEmail</strong> (opcional) - E-mail do supervisor, que é o responsável pelo projeto no novo modelo (se vazio, usa o usuário atual)</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-2">Aba "Sessoes" (opcional)</h3>
              <p className="text-sm mb-2">
                Define as sessões de cada projeto. Se não existir ou estiver vazia, cada projeto criado recebe uma sessão padrão "Geral". Na aba Etapas, use <strong>sessaoNome</strong> para vincular a etapa a uma dessas sessões.
              </p>
              <p className="text-sm mb-2">Colunas:</p>
              <ul className="list-disc list-inside text-sm space-y-1 ml-4">
                <li><strong>projetoNome</strong> (obrigatório) - Nome do projeto (igual ao da aba Projetos)</li>
                <li><strong>nome</strong> (obrigatório) - Nome da sessão (ex.: "Geral", "Módulo 1")</li>
                <li><strong>ordem</strong> (opcional) - Ordem de exibição (número; padrão 0)</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-2">Aba "Etapas" (opcional)</h3>
              <p className="text-sm mb-2">
                <strong>projetoNome</strong> pode ser o nome de um projeto criado na aba Projetos desta planilha ou o nome exato de um projeto já existente no sistema. Assim você pode inserir novas etapas em projetos existentes sem precisar preencher a aba Projetos.
              </p>
              <p className="text-sm mb-2">Colunas:</p>
              <ul className="list-disc list-inside text-sm space-y-1 ml-4">
                <li><strong>projetoNome</strong> (obrigatório) - Nome do projeto (criado nesta planilha ou já existente)</li>
                <li><strong>sessaoNome</strong> (opcional) - Nome da sessão da etapa; se vazio, usa "Geral"</li>
                <li><strong>nome</strong> (obrigatório) - Nome da etapa</li>
                <li><strong>aba</strong> (opcional) - Grupo/categoria da etapa (ex.: "Software", "Hardware")</li>
                <li><strong>descricao</strong> (opcional) - Descrição da etapa</li>
                <li><strong>dataInicio</strong> (opcional) - Data de início no formato <strong>YYYY-MM-DD</strong></li>
                <li><strong>dataFim</strong> (opcional) - Data de fim no formato <strong>YYYY-MM-DD</strong></li>
                <li><strong>valorInsumos</strong> (opcional) - Valor de insumos da etapa</li>
                <li><strong>participantesEmails</strong> (opcional) - E-mails dos participantes da etapa, separados por vírgula</li>
                <li className="text-gray-400"><strong>Compatibilidade antiga:</strong> também aceita <strong>executorEmail</strong> + <strong>integrantesEmails</strong></li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-2">Aba &quot;Tarefas&quot; (tarefas da etapa - opcional)</h3>
              <p className="text-sm mb-2">
                Planilhas antigas podem usar a aba <strong>Checklist</strong> com colunas <strong>itemTexto</strong> — o sistema aceita os dois formatos.
              </p>
              <p className="text-sm mb-2">
                <strong>projetoNome</strong> e <strong>etapaNome</strong> podem ser de um projeto e uma etapa criados nesta importação ou de projeto e etapa já existentes no sistema. As tarefas são adicionadas à etapa (sem remover as já existentes).
              </p>
              <p className="text-sm mb-2">Colunas (modelo novo):</p>
              <ul className="list-disc list-inside text-sm space-y-1 ml-4">
                <li><strong>projetoNome</strong> (obrigatório) - Nome do projeto (existente ou criado nesta planilha)</li>
                <li><strong>etapaNome</strong> (obrigatório) - Nome da etapa (existente ou criada nesta planilha)</li>
                <li><strong>tarefaTexto</strong> (obrigatório) - Texto da tarefa (na planilha antiga: <strong>itemTexto</strong>)</li>
                <li><strong>tarefaDescricao</strong> (opcional) - Descrição da tarefa (<strong>itemDescricao</strong> no modelo antigo)</li>
                <li>
                  <strong>tarefaPontos</strong> (opcional) - Pontos ao aprovar a tarefa (inteiro ≥ 1; também aceita{' '}
                  <strong>itemPontos</strong> ou <strong>pontos</strong>). Se vazio, vale <strong>1</strong>.
                </li>
                <li>
                  <strong>tarefaParticipantesEmails</strong> (opcional) - E-mails de participantes da etapa (coluna{' '}
                  <strong>participantesEmails</strong> da aba Etapas), separados por vírgula. Se vazio ou omitido,{' '}
                  <strong>todos</strong> os participantes da etapa veem a tarefa em Meu trabalho. Se preenchido, só quem
                  estiver listado (e for participante da etapa) verá essa tarefa.
                </li>
              </ul>
              <p className="text-sm mt-2 text-gray-400">
                Dica: importe primeiro a aba <strong>Etapas</strong> com os participantes corretos; só depois use e-mails
                válidos em <strong>tarefaParticipantesEmails</strong> (ou <strong>tarefaIntegrantesEmails</strong>/<strong>itemIntegrantesEmails</strong> no modelo antigo) que correspondam a esses participantes.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-2">Aba &quot;Subtarefas&quot; (opcional)</h3>
              <p className="text-sm mb-2">
                Planilhas antigas podem usar a aba <strong>ChecklistSubitens</strong> com <strong>subitemTexto</strong> — o sistema aceita os dois formatos.
              </p>
              <p className="text-sm mb-2">
                Use esta aba apenas se quiser cadastrar subtarefas em arquivo separado das tarefas principais.
              </p>
              <p className="text-sm mb-2">
                Cada linha representa uma subtarefa vinculada a uma tarefa já definida na aba <strong>Tarefas</strong> (ou <strong>Checklist</strong>).
              </p>
              <p className="text-sm mb-2">Colunas (modelo novo):</p>
              <ul className="list-disc list-inside text-sm space-y-1 ml-4">
                <li><strong>projetoNome</strong> (obrigatório) - Mesmo valor usado na aba Tarefas</li>
                <li><strong>etapaNome</strong> (obrigatório) - Mesmo valor usado na aba Tarefas</li>
                <li><strong>tarefaTexto</strong> (obrigatório) - Deve ser exatamente o mesmo texto da tarefa na aba Tarefas (<strong>itemTexto</strong> no modelo antigo)</li>
                <li><strong>subtarefaTexto</strong> (obrigatório) - Texto da subtarefa (<strong>subitemTexto</strong> no modelo antigo)</li>
                <li><strong>subtarefaDescricao</strong> (opcional) - Descrição da subtarefa (<strong>subitemDescricao</strong> no modelo antigo)</li>
                <li>
                  <strong>subtarefaPontos</strong> (opcional) - Pontos ao aprovar a subtarefa (inteiro ≥ 1; também aceita{' '}
                  <strong>subitemPontos</strong>). Se vazio, vale <strong>1</strong>.
                </li>
              </ul>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg p-6">
          <div className="mb-6">
            <label htmlFor="file" className="block text-sm font-medium mb-2">
              Arquivo Excel (.xlsx ou .xls)
            </label>
            <FileDropInput
              id="file"
              accept=".xlsx,.xls"
              onFilesSelected={(files) => handleFileChange(files[0])}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={uploading}
              dropMessage="Solte o arquivo Excel aqui"
            />
            {file && (
              <p className="mt-2 text-sm text-gray-400">
                Arquivo selecionado: {file.name} ({(file.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300">
              {error}
            </div>
          )}

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={!file || uploading}
              className={btn.primary}
            >
              {uploading ? 'Importando...' : 'Importar Projetos'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/projects')}
              className={btn.secondary}
              disabled={uploading}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
