import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, type DataTableColumn } from '../DataTable';
import { api } from '../../services/api';
import {
  criarDocumento,
  listarDocumentosVencendo,
  type DocumentoColaborador,
  type DocumentoColaboradorTipo,
} from '../../services/rh';
import { useAuthStore } from '../../store/auth';
import { userHasPermission } from '../../utils/projectAccess';
import { toast, formatApiError } from '../../utils/toast';
import { FilePreviewTrigger } from '../files/FilePreviewTrigger';
import { CollapsibleFilters } from '../filters/CollapsibleFilters';
import { Card, Field, Modal, formatData } from './rhUi';

type TipoDocFiltro = 'all' | DocumentoColaboradorTipo;
type ValidadeFiltro = 'all' | 'vencidos' | 'vencendo30' | 'vencendo60';

export interface UserOption {
  id: number;
  nome: string;
  cargo?: { nome: string } | null;
}

const TIPOS: { id: DocumentoColaboradorTipo; label: string }[] = [
  { id: 'CONTRATO', label: 'Contrato' },
  { id: 'ASO', label: 'ASO' },
  { id: 'RG', label: 'RG' },
  { id: 'CPF', label: 'CPF' },
  { id: 'COMPROVANTE_RESIDENCIA', label: 'Comprovante de residência' },
  { id: 'CERTIFICADO', label: 'Certificado' },
  { id: 'CARTEIRA_TRABALHO', label: 'Carteira de trabalho' },
  { id: 'OUTRO', label: 'Outro' },
];

export function TabDocumentos() {
  const user = useAuthStore((s) => s.user);
  const podeGerenciar = userHasPermission(user, 'documentos_rh:gerenciar');
  const navigate = useNavigate();

  const [vencendo, setVencendo] = useState<DocumentoColaborador[]>([]);
  const [usuarios, setUsuarios] = useState<UserOption[]>([]);

  const [showFiltros, setShowFiltros] = useState(false);
  const [busca, setBusca] = useState('');
  const [cargoFiltro, setCargoFiltro] = useState<string>('all');
  const [tipoDocFiltro, setTipoDocFiltro] = useState<TipoDocFiltro>('all');
  const [validadeFiltro, setValidadeFiltro] = useState<ValidadeFiltro>('all');

  const carregar = useCallback(async () => {
    if (!podeGerenciar) return;
    try {
      const v = await listarDocumentosVencendo(60).catch(() => []);
      setVencendo(v);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }, [podeGerenciar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!podeGerenciar) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await api.get<UserOption[]>('/users/options');
        if (!cancelled) setUsuarios(Array.isArray(data) ? data : []);
      } catch {
        /* noop */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [podeGerenciar]);

  const colunasColaboradores = useMemo((): DataTableColumn<UserOption>[] => {
    return [
      {
        key: 'nome',
        label: 'Colaborador',
        render: (u) => <span className="font-medium text-white/95">{u.nome}</span>,
      },
      {
        key: 'cargo',
        label: 'Cargo',
        thClassName: 'hidden sm:table-cell',
        tdClassName: 'hidden sm:table-cell text-white/65',
        render: (u) => u.cargo?.nome ?? '—',
      },
      {
        key: 'hint',
        label: '',
        align: 'right',
        thClassName: 'w-36',
        render: () => <span className="text-xs text-primary/90">Abrir documentos →</span>,
      },
    ];
  }, []);

  // Lista de cargos únicos para o select.
  const cargosOpcoes = useMemo(() => {
    const set = new Set<string>();
    for (const u of usuarios) {
      const nome = u.cargo?.nome?.trim();
      if (nome) set.add(nome);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [usuarios]);

  const usuariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return usuarios.filter((u) => {
      if (termo && !u.nome.toLowerCase().includes(termo)) return false;
      if (cargoFiltro !== 'all' && (u.cargo?.nome ?? '') !== cargoFiltro) return false;
      return true;
    });
  }, [usuarios, busca, cargoFiltro]);

  const docsVencendoFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const limite30 = new Date(hoje);
    limite30.setDate(limite30.getDate() + 30);
    const limite60 = new Date(hoje);
    limite60.setDate(limite60.getDate() + 60);

    return vencendo.filter((d) => {
      if (termo) {
        const alvo = `${d.usuario?.nome ?? ''} ${d.titulo}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      if (cargoFiltro !== 'all') {
        const usuario = usuarios.find((u) => u.id === d.usuarioId);
        if ((usuario?.cargo?.nome ?? '') !== cargoFiltro) return false;
      }
      if (tipoDocFiltro !== 'all' && d.tipo !== tipoDocFiltro) return false;
      if (validadeFiltro !== 'all') {
        if (!d.dataValidade) return false;
        const validade = new Date(d.dataValidade);
        if (validadeFiltro === 'vencidos' && validade >= hoje) return false;
        if (validadeFiltro === 'vencendo30' && (validade < hoje || validade > limite30)) return false;
        if (validadeFiltro === 'vencendo60' && (validade < hoje || validade > limite60)) return false;
      }
      return true;
    });
  }, [vencendo, busca, cargoFiltro, tipoDocFiltro, validadeFiltro, usuarios]);

  const filtrosAtivos =
    busca.trim().length > 0 ||
    cargoFiltro !== 'all' ||
    tipoDocFiltro !== 'all' ||
    validadeFiltro !== 'all';

  const limparFiltros = () => {
    setBusca('');
    setCargoFiltro('all');
    setTipoDocFiltro('all');
    setValidadeFiltro('all');
  };

  if (!podeGerenciar) {
    return (
      <div className="space-y-4">
        <Card title="Documentos">
          <p className="text-white/65 text-sm leading-relaxed">
            Esta área é destinada ao RH para cadastro e gestão de documentos dos colaboradores. Se precisar enviar ou
            consultar seus arquivos, fale com o RH.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CollapsibleFilters
        show={showFiltros}
        setShow={setShowFiltros}
        hasActiveFilters={filtrosAtivos}
        onClear={limparFiltros}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Buscar</label>
            <input
              type="text"
              placeholder="Colaborador ou título do documento…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">Cargo</label>
            <select
              value={cargoFiltro}
              onChange={(e) => setCargoFiltro(e.target.value)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
            >
              <option value="all" className="bg-neutral text-white">Todos os cargos</option>
              {cargosOpcoes.map((c) => (
                <option key={c} value={c} className="bg-neutral text-white">
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">
              Tipo de documento
              <span className="text-white/40 ml-1">(aba "a vencer")</span>
            </label>
            <select
              value={tipoDocFiltro}
              onChange={(e) => setTipoDocFiltro(e.target.value as TipoDocFiltro)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
            >
              <option value="all" className="bg-neutral text-white">Todos os tipos</option>
              {TIPOS.map((t) => (
                <option key={t.id} value={t.id} className="bg-neutral text-white">
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-white/90 mb-1">
              Validade
              <span className="text-white/40 ml-1">(aba "a vencer")</span>
            </label>
            <select
              value={validadeFiltro}
              onChange={(e) => setValidadeFiltro(e.target.value as ValidadeFiltro)}
              className="w-full bg-neutral border border-white/30 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none cursor-pointer"
            >
              <option value="all" className="bg-neutral text-white">Todos</option>
              <option value="vencidos" className="bg-neutral text-white">Já vencidos</option>
              <option value="vencendo30" className="bg-neutral text-white">Vencem em até 30 dias</option>
              <option value="vencendo60" className="bg-neutral text-white">Vencem em até 60 dias</option>
            </select>
          </div>
        </div>
      </CollapsibleFilters>

      <Card
        title="Colaboradores"
        actions={
          <p className="text-xs text-white/50 max-w-xs text-right hidden sm:block">
            Clique em uma linha para abrir a página de documentos do colaborador.
          </p>
        }
      >
        <DataTable<UserOption>
          columns={colunasColaboradores}
          data={usuariosFiltrados}
          keyExtractor={(u) => u.id}
          emptyMessage={
            filtrosAtivos
              ? 'Nenhum colaborador atende aos filtros aplicados.'
              : 'Nenhum colaborador encontrado.'
          }
          onRowClick={(u) => navigate(`/rh/documentos/${u.id}`)}
          renderMobileCard={(u) => (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
              <p className="font-medium text-white/95">{u.nome}</p>
              <p className="text-white/60 text-xs mt-1">{u.cargo?.nome ?? '—'}</p>
              <p className="text-primary/90 text-xs mt-2">Toque para abrir os documentos</p>
            </div>
          )}
        />
      </Card>

      <Card title="Documentos a vencer (60 dias)">
        <p className="text-xs text-white/45 mb-3">
          Visão geral de alertas; para incluir ou remover arquivos, abra o colaborador na tabela acima.
        </p>
        <RhDocumentosTabela
          docs={docsVencendoFiltrados}
          loading={false}
          mostrarUsuario
          emptyMessage={
            filtrosAtivos
              ? 'Nenhum documento atende aos filtros aplicados.'
              : 'Nenhum documento.'
          }
        />
      </Card>
    </div>
  );
}

export function RhDocumentosTabela({
  docs,
  loading,
  mostrarUsuario,
  onRemover,
  emptyMessage = 'Nenhum documento.',
}: {
  docs: DocumentoColaborador[];
  loading: boolean;
  mostrarUsuario: boolean;
  onRemover?: (id: number) => Promise<void>;
  emptyMessage?: string;
}) {
  const columns = useMemo((): DataTableColumn<DocumentoColaborador>[] => {
    const cols: DataTableColumn<DocumentoColaborador>[] = [
      { key: 'tipo', label: 'Tipo', render: (d) => d.tipo },
      { key: 'titulo', label: 'Título', render: (d) => d.titulo },
    ];
    if (mostrarUsuario) {
      cols.push({
        key: 'usuario',
        label: 'Colaborador',
        render: (d) => d.usuario?.nome ?? `#${d.usuarioId}`,
      });
    }
    cols.push({
      key: 'validade',
      label: 'Validade',
      render: (d) => (
        <span
          className={
            d.dataValidade && new Date(d.dataValidade) < new Date() ? 'text-red-300' : ''
          }
        >
          {formatData(d.dataValidade)}
        </span>
      ),
    });
    cols.push({
      key: 'arquivo',
      label: 'Arquivo',
      stopRowClick: true,
      render: (d) => (
        <FilePreviewTrigger src={d.arquivoUrl} className="text-primary hover:underline">
          Abrir
        </FilePreviewTrigger>
      ),
    });
    if (onRemover) {
      cols.push({
        key: 'acoes',
        label: 'Ações',
        align: 'right',
        stopRowClick: true,
        render: (d) => (
          <button
            type="button"
            onClick={() => void onRemover(d.id)}
            className="text-red-300 hover:text-red-200"
          >
            Remover
          </button>
        ),
      });
    }
    return cols;
  }, [mostrarUsuario, onRemover]);

  return (
    <DataTable<DocumentoColaborador>
      columns={columns}
      data={docs}
      keyExtractor={(d) => d.id}
      loading={loading}
      emptyMessage={emptyMessage}
      renderMobileCard={(d) => (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm space-y-2">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="font-semibold text-white/90">{d.tipo}</span>
            {mostrarUsuario ? (
              <span className="text-white/60 text-xs">{d.usuario?.nome ?? `#${d.usuarioId}`}</span>
            ) : null}
          </div>
          <p className="text-white/85">{d.titulo}</p>
          <p
            className={
              d.dataValidade && new Date(d.dataValidade) < new Date() ? 'text-red-300' : 'text-white/60'
            }
          >
            Validade: {formatData(d.dataValidade)}
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <FilePreviewTrigger src={d.arquivoUrl} className="text-primary hover:underline text-sm">
              Abrir arquivo
            </FilePreviewTrigger>
            {onRemover ? (
              <button
                type="button"
                onClick={() => void onRemover(d.id)}
                className="text-red-300 hover:text-red-200 text-sm"
              >
                Remover
              </button>
            ) : null}
          </div>
        </div>
      )}
    />
  );
}

export function NovoDocModal({
  usuarios,
  usuarioIdInicial,
  fixarColaborador,
  onClose,
  onSaved,
}: {
  usuarios: UserOption[];
  usuarioIdInicial?: number;
  fixarColaborador?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [usuarioId, setUsuarioId] = useState<number | ''>(() =>
    usuarioIdInicial != null ? usuarioIdInicial : '',
  );
  const [tipo, setTipo] = useState<DocumentoColaboradorTipo>('CONTRATO');
  const [titulo, setTitulo] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [dataValidade, setDataValidade] = useState('');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (usuarioIdInicial != null) setUsuarioId(usuarioIdInicial);
  }, [usuarioIdInicial]);

  async function salvar() {
    const uid = fixarColaborador && usuarioIdInicial != null ? usuarioIdInicial : usuarioId;
    if (!uid || !arquivo || !titulo.trim()) {
      toast.error(fixarColaborador ? 'Informe título e arquivo.' : 'Selecione colaborador, título e arquivo.');
      return;
    }
    setSalvando(true);
    try {
      await criarDocumento({
        usuarioId: Number(uid),
        tipo,
        titulo: titulo.trim(),
        arquivo,
        dataValidade: dataValidade || undefined,
        observacao: observacao.trim() || undefined,
      });
      toast.success('Documento enviado.');
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title={fixarColaborador ? `Novo documento — ${usuarios.find((u) => u.id === usuarioIdInicial)?.nome ?? ''}` : 'Novo documento'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            className="px-3 py-2 rounded bg-primary text-neutral font-semibold text-sm disabled:opacity-50"
          >
            {salvando ? 'Enviando...' : 'Enviar'}
          </button>
        </>
      }
    >
      {!fixarColaborador ? (
        <Field label="Colaborador">
          <select
            value={usuarioId === '' ? '' : String(usuarioId)}
            onChange={(e) => setUsuarioId(e.target.value ? Number(e.target.value) : '')}
            className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
          >
            <option value="">Selecione...</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo">
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as DocumentoColaboradorTipo)}
            className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
          >
            {TIPOS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Validade (opcional)">
          <input
            type="date"
            value={dataValidade}
            onChange={(e) => setDataValidade(e.target.value)}
            className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
          />
        </Field>
      </div>
      <Field label="Título">
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
        />
      </Field>
      <Field label="Observação">
        <textarea
          rows={2}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          className="w-full bg-neutral border border-white/10 rounded px-2 py-1 text-sm"
        />
      </Field>
      <Field label="Arquivo (PDF ou imagem)">
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          className="w-full text-sm"
        />
      </Field>
    </Modal>
  );
}
